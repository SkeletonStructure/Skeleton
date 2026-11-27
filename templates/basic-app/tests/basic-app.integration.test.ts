import { fileURLToPath } from 'node:url';

import { runApplicationMigrations, startApplication } from '@skeletonstructure/app-composition';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  basicAppMigrationFolders,
  createBasicAppComposition,
  runBasicAppMigrations,
} from '../src/server.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const originalEnv = new Map<string, string | undefined>();
let container: StartedPostgreSqlContainer | undefined;
let runtime: Awaited<ReturnType<typeof startApplication>> | undefined;

beforeAll(async () => {
  for (const key of ['DATABASE_URL', 'HOST', 'PORT', 'NODE_ENV', 'LOG_FORMAT'] as const) {
    originalEnv.set(key, process.env[key]);
  }

  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '3117';
  process.env.NODE_ENV = 'test';
  process.env.LOG_FORMAT = 'json';

  const migration = await runApplicationMigrations({
    cwd: appRoot,
    migrate: runBasicAppMigrations,
  });
  expect(migration.appliedCount).toBeGreaterThan(0);
}, 180_000);

afterAll(async () => {
  await runtime?.close();
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await container?.stop();
}, 60_000);

describe('basic application template', () => {
  it('starts with migration readiness enabled and exposes the public health surface', async () => {
    runtime = await startApplication({
      cwd: appRoot,
      compose: createBasicAppComposition,
      migrationFolders: basicAppMigrationFolders,
    });

    const live = await runtime.app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);

    const ready = await runtime.app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ok' });

    const publicConfig = await runtime.app.inject({ method: 'GET', url: '/v1/config/public' });
    expect(publicConfig.statusCode).toBe(200);
    expect(publicConfig.json().data).toMatchObject({
      appName: 'Basic SkeletonStructure app',
      apiBaseUrl: '/v1',
      authMode: 'session',
    });
  }, 120_000);
});
