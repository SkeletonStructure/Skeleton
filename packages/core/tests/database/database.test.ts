import { readdir, readFile } from 'node:fs/promises';

import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineConfig, env, envBool, envInt, loadConfig } from '../../src/config/index.js';
import {
  checkDatabaseHealth,
  closeDatabase,
  DatabaseError,
  getDatabase,
  initializeDatabase,
  isDatabaseInitialized,
} from '../../src/database/index.js';
import { defaultMigrationsFolder } from '../../src/database/migrations.js';
import { createPostgresDatabase, poolOptionsFromConfig } from '../../src/database/postgres.js';
import type { DrizzleDatabase, PoolClientLike, PoolLike } from '../../src/database/types.js';

const VALID_DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';

const fakeDrizzle = {
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ marker: 'tx' })),
} as unknown as DrizzleDatabase;

async function makeConfig(environment: Record<string, string> = {}) {
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: VALID_DATABASE_URL, ...environment },
    config: () =>
      defineConfig({
        database: {
          url: env('DATABASE_URL'),
          ssl: envBool('DATABASE_SSL', false),
          pool: {
            max: envInt('DB_POOL_MAX', 10),
            idleTimeoutMs: envInt('DB_POOL_IDLE_TIMEOUT_MS', 300_000),
            connectTimeoutMs: envInt('DB_POOL_CONNECT_TIMEOUT_MS', 10_000),
          },
        },
      }),
  });
}

interface FakePool {
  pool: PoolLike;
  client: PoolClientLike;
  query: Mock<(sql: string) => Promise<unknown>>;
  connect: Mock<() => Promise<PoolClientLike>>;
  end: Mock<() => Promise<void>>;
  clientQuery: Mock<(sql: string) => Promise<unknown>>;
  release: Mock<() => void>;
}

function makeFakePool(
  queryImplementation: (sql: string) => Promise<unknown> = async () => ({ rows: [] }),
  clientQueryImplementation: (sql: string) => Promise<unknown> = async () => ({ rows: [] }),
): FakePool {
  const query = vi.fn(queryImplementation);
  const clientQuery = vi.fn(clientQueryImplementation);
  const release = vi.fn(() => undefined);
  const connect = vi.fn(async () => ({ query: clientQuery, release }) as PoolClientLike);
  const end = vi.fn(async () => undefined);

  return {
    pool: { query, connect, end },
    client: { query: clientQuery, release },
    query,
    connect,
    end,
    clientQuery,
    release,
  };
}

afterEach(async () => {
  await closeDatabase();
});

describe('database configuration integration', () => {
  it('maps validated M2 database settings to pool options', async () => {
    const config = await makeConfig({
      DATABASE_SSL: 'true',
      DB_POOL_MAX: '4',
      DB_POOL_IDLE_TIMEOUT_MS: '120000',
      DB_POOL_CONNECT_TIMEOUT_MS: '2500',
    });

    expect(poolOptionsFromConfig(config.database)).toEqual({
      connectionString: VALID_DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 120_000,
      connectionTimeoutMillis: 2_500,
      ssl: { rejectUnauthorized: true },
    });
  });

  it('uses blueprint pool defaults when no overrides are present', async () => {
    const config = await makeConfig();

    expect(config.database.pool).toEqual({
      max: 10,
      idleTimeoutMs: 300_000,
      connectTimeoutMs: 10_000,
    });
  });
});

describe('PostgresDatabase lifecycle', () => {
  it('verifies connectivity during initialization', async () => {
    const config = await makeConfig();
    const fake = makeFakePool();
    const database = createPostgresDatabase(config.database, {
      createPool: () => fake.pool,
      createDrizzle: () => fakeDrizzle,
    });

    await database.initialize();

    expect(fake.query).toHaveBeenCalledWith('SELECT 1');
    expect(database.db).toBe(fakeDrizzle);
  });

  it('rejects duplicate initialization', async () => {
    const config = await makeConfig();
    const fake = makeFakePool();
    const database = createPostgresDatabase(config.database, {
      createPool: () => fake.pool,
      createDrizzle: () => fakeDrizzle,
    });

    await database.initialize();

    await expect(database.initialize()).rejects.toMatchObject({
      code: 'DATABASE_ALREADY_INITIALIZED',
    });
  });

  it('fails initialization with a safe error and releases the pool', async () => {
    const secretUrl = 'postgres://user:supersecret@db.example.com:5432/app';
    const config = await makeConfig({ DATABASE_URL: secretUrl });
    const fake = makeFakePool(async () => {
      throw new Error(`connection rejected for ${secretUrl}`);
    });
    const database = createPostgresDatabase(config.database, {
      createPool: () => fake.pool,
      createDrizzle: () => fakeDrizzle,
    });

    const error = await database.initialize().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DatabaseError);
    expect(error).toMatchObject({ code: 'DATABASE_INITIALIZATION_FAILED' });
    expect((error as Error).message).not.toContain(secretUrl);
    expect((error as Error).message).not.toContain('supersecret');
    expect(fake.end).toHaveBeenCalledOnce();
    expect(() => database.db).toThrow(DatabaseError);
  });

  it('closes the pool exactly once', async () => {
    const config = await makeConfig();
    const fake = makeFakePool();
    const database = createPostgresDatabase(config.database, {
      createPool: () => fake.pool,
      createDrizzle: () => fakeDrizzle,
    });

    await database.initialize();
    await database.close();
    await database.close();

    expect(fake.end).toHaveBeenCalledOnce();
    expect(await database.health()).toEqual({
      status: 'error',
      reason: 'DATABASE_NOT_INITIALIZED',
    });
  });
});

describe('database health', () => {
  it('reports availability without connection details', async () => {
    const config = await makeConfig();
    const fake = makeFakePool();
    const database = createPostgresDatabase(config.database, {
      createPool: () => fake.pool,
      createDrizzle: () => fakeDrizzle,
    });

    await database.initialize();

    expect(await database.health()).toEqual({ status: 'ok' });
    expect(JSON.stringify(await database.health())).not.toContain(VALID_DATABASE_URL);
  });

  it('reports DATABASE_UNAVAILABLE when the database cannot be reached', async () => {
    const config = await makeConfig();
    let attempt = 0;
    const fake = makeFakePool(async () => {
      attempt += 1;
      if (attempt === 1) return { rows: [] };
      throw new Error(`connection refused for ${VALID_DATABASE_URL}`);
    });
    const database = createPostgresDatabase(config.database, {
      createPool: () => fake.pool,
      createDrizzle: () => fakeDrizzle,
    });

    await database.initialize();

    expect(await database.health()).toEqual({
      status: 'error',
      reason: 'DATABASE_UNAVAILABLE',
    });
  });
});

describe('database migrations', () => {
  it('runs migrations under an advisory lock and detects a no-op re-run', async () => {
    const config = await makeConfig();
    const order: string[] = [];
    let countIndex = 0;
    const counts = [0, 1, 4, 4];
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_lock(')) {
        order.push('lock');
        return { rows: [] };
      }
      if (sql.includes('pg_advisory_unlock(')) {
        order.push('unlock');
        return { rows: [] };
      }
      if (sql.includes('__drizzle_migrations')) {
        order.push('count');
        return { rows: [{ count: counts[countIndex++] ?? 0 }] };
      }
      return { rows: [] };
    });
    const connect = vi.fn(async () => ({ query: clientQuery, release: vi.fn() }) as PoolClientLike);
    const pool: PoolLike = {
      query: vi.fn(async () => ({ rows: [] })),
      connect,
      end: vi.fn(async () => undefined),
    };
    const migrate = vi.fn(async () => {
      order.push('migrate');
    });
    const database = createPostgresDatabase(config.database, {
      createPool: () => pool,
      createDrizzle: () => fakeDrizzle,
      migrate,
    });

    await database.initialize();

    expect(await database.migrate()).toEqual({ appliedCount: 1, upToDate: false });
    expect(await database.migrate()).toEqual({ appliedCount: 0, upToDate: true });
    expect(order).toEqual([
      'lock',
      'count',
      'migrate',
      'count',
      'unlock',
      'lock',
      'count',
      'migrate',
      'count',
      'unlock',
    ]);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('keeps the committed migration baseline free of application tables', async () => {
    const folder = defaultMigrationsFolder();
    const files = (await readdir(folder)).filter((file) => file.endsWith('.sql'));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const sql = await readFile(`${folder}/${file}`, 'utf8');
      expect(sql.replace(/--.*$/gm, '').trim()).toBe('');
    }
  });
});

describe('shared database manager', () => {
  it('exposes one initialized database and closes it cleanly', async () => {
    const config = await makeConfig();
    const fake = makeFakePool();
    const options = {
      createPool: () => fake.pool,
      createDrizzle: () => fakeDrizzle,
    };

    expect(isDatabaseInitialized()).toBe(false);
    expect(() => getDatabase()).toThrow(DatabaseError);
    expect(await checkDatabaseHealth()).toEqual({
      status: 'error',
      reason: 'DATABASE_NOT_INITIALIZED',
    });

    const database = await initializeDatabase(config.database, options);

    expect(database).toBe(getDatabase());
    expect(isDatabaseInitialized()).toBe(true);
    await expect(initializeDatabase(config.database, options)).rejects.toMatchObject({
      code: 'DATABASE_ALREADY_INITIALIZED',
    });

    await closeDatabase();
    await closeDatabase();

    expect(isDatabaseInitialized()).toBe(false);
    expect(fake.end).toHaveBeenCalledOnce();
  });
});
