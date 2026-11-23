import type { Database } from '@skeletonstructure/core/database';
import { createModuleRegistry } from '@skeletonstructure/core/modules';
import { describe, expect, it } from 'vitest';

import { defineConfig, env, loadConfig } from '../../core/src/config/index.js';
import type { ModuleConfigSource } from '../../core/src/modules/index.js';
import { createUsersModule, isValidEmail, normalizeEmail } from '../src/index.js';

const DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';

const fakeDatabase = {
  db: {},
  transaction: async (fn: (tx: never) => Promise<unknown>) => fn({} as never),
  health: async () => ({ status: 'ok' }),
  migrate: async () => ({ appliedCount: 0, upToDate: true }),
  close: async () => undefined,
} as unknown as Database;

async function makeAppConfig(allowSelfUpdate: boolean) {
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL },
    config: () =>
      defineConfig({
        database: { url: env('DATABASE_URL') },
        modules: { users: { enabled: true, allowSelfUpdate } },
      }),
  });
}

describe('users module (unit)', () => {
  it('normalizes and validates email addresses', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });

  it('registers the self-update route only when enabled', async () => {
    const enabled = createUsersModule({
      appConfig: await makeAppConfig(true),
      database: fakeDatabase,
    });
    expect(enabled.routeHandlers.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /users/me',
      'PATCH /users/me',
    ]);

    const disabled = createUsersModule({
      appConfig: await makeAppConfig(false),
      database: fakeDatabase,
    });
    expect(disabled.routeHandlers.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /users/me',
    ]);
  });

  it('participates in the M4 activation report', async () => {
    const appConfig = await makeAppConfig(false);
    const module = createUsersModule({ appConfig, database: fakeDatabase });
    const registry = createModuleRegistry({ appConfig, database: fakeDatabase });
    registry.register(module.definition);

    const report = await registry.activate({
      moduleConfig: {
        ...(appConfig.modules as unknown as ModuleConfigSource),
        users: { enabled: true, allowSelfUpdate: false },
      },
    });

    expect(report.order).toEqual(['users']);
    expect(report.permissions.map((permission) => permission.key)).toEqual([
      'users:read:self',
      'users:update:self',
    ]);
    expect(report.routes).toEqual([
      { moduleId: 'users', method: 'GET', path: '/users/me', permission: 'users:read:self' },
    ]);
  });
});
