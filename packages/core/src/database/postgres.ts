import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as runDrizzleMigrations } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';

import { DatabaseError } from './errors.js';
import {
  countAppliedMigrations,
  defaultMigrationsFolder,
  withMigrationAdvisoryLock,
} from './migrations.js';
import type {
  Database,
  DatabaseConfig,
  DatabaseHealthResult,
  DatabaseTransaction,
  DrizzleDatabase,
  MigrateOptions,
  MigrationReport,
  PoolClientLike,
  PoolLike,
} from './types.js';

type DatabaseState = 'new' | 'initializing' | 'ready' | 'closed';

type DrizzleFactory = (client: PoolLike | PoolClientLike) => DrizzleDatabase;

type MigrationRunner = (
  database: DrizzleDatabase,
  options: { readonly migrationsFolder: string },
) => Promise<void>;

export interface PostgresDatabaseDependencies {
  readonly createPool?: (config: DatabaseConfig) => PoolLike;
  readonly createDrizzle?: DrizzleFactory;
  readonly migrate?: MigrationRunner;
}

interface ResolvedDependencies {
  readonly createPool: (config: DatabaseConfig) => PoolLike;
  readonly createDrizzle: DrizzleFactory;
  readonly migrate: MigrationRunner;
}

export function poolOptionsFromConfig(config: DatabaseConfig) {
  return {
    connectionString: config.url,
    max: config.pool.max,
    idleTimeoutMillis: config.pool.idleTimeoutMs,
    connectionTimeoutMillis: config.pool.connectTimeoutMs,
    ssl: config.ssl ? { rejectUnauthorized: true } : false,
  } as const;
}

function createDefaultPool(config: DatabaseConfig): PoolLike {
  return new Pool(poolOptionsFromConfig(config));
}

function createDefaultDrizzle(client: PoolLike | PoolClientLike): DrizzleDatabase {
  return drizzle(client as Pool | PoolClient) as DrizzleDatabase;
}

function resolveDependencies(dependencies: PostgresDatabaseDependencies): ResolvedDependencies {
  return {
    createPool: dependencies.createPool ?? createDefaultPool,
    createDrizzle: dependencies.createDrizzle ?? createDefaultDrizzle,
    migrate: dependencies.migrate ?? runDrizzleMigrations,
  };
}

export class PostgresDatabase implements Database {
  private state: DatabaseState = 'new';
  private pool: PoolLike | undefined;
  private drizzle: DrizzleDatabase | undefined;

  constructor(
    private readonly config: DatabaseConfig,
    private readonly dependencies: ResolvedDependencies,
  ) {}

  async initialize(): Promise<void> {
    if (this.state !== 'new') {
      throw new DatabaseError(
        'DATABASE_ALREADY_INITIALIZED',
        'Database has already been initialized.',
      );
    }

    this.state = 'initializing';
    let pool: PoolLike | undefined;

    try {
      pool = this.dependencies.createPool(this.config);
      await pool.query('SELECT 1');
      this.drizzle = this.dependencies.createDrizzle(pool);
      this.pool = pool;
      this.state = 'ready';
    } catch (error) {
      this.state = 'closed';
      if (pool !== undefined) await pool.end().catch(() => undefined);
      throw new DatabaseError(
        'DATABASE_INITIALIZATION_FAILED',
        'Unable to initialize database connection.',
        error,
      );
    }
  }

  get db(): DrizzleDatabase {
    return this.requireDrizzle();
  }

  async transaction<T>(fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const drizzle = this.requireDrizzle();
    return drizzle.transaction((tx) => fn(tx as DatabaseTransaction));
  }

  async health(): Promise<DatabaseHealthResult> {
    if (this.state !== 'ready' || this.pool === undefined) {
      return { status: 'error', reason: 'DATABASE_NOT_INITIALIZED' };
    }

    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return { status: 'error', reason: 'DATABASE_UNAVAILABLE' };
    }
  }

  async migrate(options: MigrateOptions = {}): Promise<MigrationReport> {
    const pool = this.requirePool();
    const migrationsFolder = options.migrationsFolder ?? defaultMigrationsFolder();

    try {
      const client = await pool.connect();
      try {
        return await withMigrationAdvisoryLock(client, async () => {
          const before = await countAppliedMigrations(client);
          const migrationDatabase = this.dependencies.createDrizzle(client);
          await this.dependencies.migrate(migrationDatabase, { migrationsFolder });
          const after = await countAppliedMigrations(client);

          return {
            appliedCount: Math.max(0, after - before),
            upToDate: after === before,
          };
        });
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('DATABASE_MIGRATION_FAILED', 'Database migration failed.', error);
    }
  }

  async close(): Promise<void> {
    if (this.state === 'closed' || this.state === 'new') {
      this.state = 'closed';
      return;
    }

    const pool = this.pool;
    this.state = 'closed';
    this.pool = undefined;
    this.drizzle = undefined;

    if (pool === undefined) return;

    try {
      await pool.end();
    } catch (error) {
      throw new DatabaseError(
        'DATABASE_SHUTDOWN_FAILED',
        'Unable to close database pool cleanly.',
        error,
      );
    }
  }

  private requirePool(): PoolLike {
    if (this.state !== 'ready' || this.pool === undefined) {
      throw new DatabaseError('DATABASE_NOT_INITIALIZED', 'Database has not been initialized.');
    }
    return this.pool;
  }

  private requireDrizzle(): DrizzleDatabase {
    if (this.state !== 'ready' || this.drizzle === undefined) {
      throw new DatabaseError('DATABASE_NOT_INITIALIZED', 'Database has not been initialized.');
    }
    return this.drizzle;
  }
}

export function createPostgresDatabase(
  config: DatabaseConfig,
  dependencies: PostgresDatabaseDependencies = {},
): PostgresDatabase {
  return new PostgresDatabase(config, resolveDependencies(dependencies));
}
