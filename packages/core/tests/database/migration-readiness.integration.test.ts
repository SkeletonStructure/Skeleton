import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { defineConfig, env, loadConfig } from '../../src/config/index.js';
import {
  closeDatabase,
  createMigrationReadinessCheck,
  defaultMigrationsFolder,
  initializeDatabase,
} from '../../src/database/index.js';

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

describe('migration readiness against PostgreSQL', () => {
  it('fails before migrations are applied and passes after the explicit migration run', async () => {
    if (container === undefined) throw new Error('PostgreSQL container is unavailable.');

    const config = await loadConfig({
      envFiles: false,
      environment: { DATABASE_URL: container.getConnectionUri(), DB_POOL_MAX: '5' },
      config: () =>
        defineConfig({
          database: { url: env('DATABASE_URL') },
        }),
    });

    const database = await initializeDatabase(config.database);
    const check = createMigrationReadinessCheck({
      database,
      migrationsFolders: [defaultMigrationsFolder()],
    });

    await expect(check.check()).resolves.toEqual({
      status: 'error',
      reason: 'MIGRATIONS_PENDING',
    });

    await database.migrate();

    await expect(check.check()).resolves.toEqual({ status: 'ok' });
  });
});
