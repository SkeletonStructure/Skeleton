import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { defineConfig, env, loadConfig } from '../../src/config/index.js';
import { closeDatabase, initializeDatabase } from '../../src/database/index.js';

let container: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();
}, 180_000);

afterEach(async () => {
  await closeDatabase();
});

afterAll(async () => {
  await container?.stop();
}, 60_000);

describe('PostgreSQL integration (Testcontainers)', () => {
  it('migrates a fresh database, treats a re-run as a no-op, and closes cleanly', async () => {
    if (container === undefined) throw new Error('PostgreSQL test container was not started.');

    const config = await loadConfig({
      envFiles: false,
      environment: {
        DATABASE_URL: container.getConnectionUri(),
        DB_POOL_MAX: '5',
      },
      config: () =>
        defineConfig({
          database: {
            url: env('DATABASE_URL'),
          },
        }),
    });

    const database = await initializeDatabase(config.database);

    expect(await database.health()).toEqual({ status: 'ok' });

    const firstRun = await database.migrate();
    // Core now applies the empty baseline plus the append-only audit table.
    expect(firstRun.appliedCount).toBe(2);
    expect(firstRun.upToDate).toBe(false);

    const secondRun = await database.migrate();
    expect(secondRun.appliedCount).toBe(0);
    expect(secondRun.upToDate).toBe(true);

    await closeDatabase();
    expect(await database.health()).toEqual({
      status: 'error',
      reason: 'DATABASE_NOT_INITIALIZED',
    });
  }, 120_000);
});
