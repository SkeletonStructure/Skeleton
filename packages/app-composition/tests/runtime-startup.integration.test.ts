import { fileURLToPath } from 'node:url';
import { emptyActivationReport } from '@skeletonstructure/core/api';
import { closeDatabase } from '@skeletonstructure/core/database';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startApplication } from '../src/runtime.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const originalEnv = new Map<string, string | undefined>();
let container: StartedPostgreSqlContainer | undefined;

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
  process.env.PORT = '3118';
  process.env.NODE_ENV = 'test';
  process.env.LOG_FORMAT = 'json';
}, 180_000);

afterAll(async () => {
  await closeDatabase();
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await container?.stop();
}, 60_000);

describe('application runtime startup failures', () => {
  it('closes the database before propagating the failure', async () => {
    await expect(
      startApplication({
        cwd: appRoot,
        compose: async () => {
          throw new Error('composition failed');
        },
      }),
    ).rejects.toThrow('composition failed');

    const runtime = await startApplication({
      cwd: appRoot,
      compose: async () => ({
        activationReport: emptyActivationReport(),
        routeHandlers: [],
        authenticator: { authenticate: async () => undefined },
        csrfGuard: { verify: () => undefined },
      }),
    });

    try {
      expect(runtime.lifecycle.state).toBe('ready');
    } finally {
      await runtime.close();
    }
  }, 120_000);
});
