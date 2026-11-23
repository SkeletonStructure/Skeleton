import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import { createModuleRegistry, type ModuleConfigSource } from '@skeletonstructure/core/modules';
import { createUsersModule } from '@skeletonstructure/module-users';
import { describe, expect, it, vi } from 'vitest';
import { defineConfig, env, loadConfig } from '../../core/src/config/index.js';

import {
  authModuleConfigSchema,
  createAuthModule,
  createConsoleEmailProvider,
  createInMemoryEmailProvider,
} from '../src/index.js';

const DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';

const fakeDatabase = {
  db: {},
  transaction: async (fn: (tx: never) => Promise<unknown>) => fn({} as never),
  health: async () => ({ status: 'ok' }),
  migrate: async () => ({ appliedCount: 0, upToDate: true }),
  close: async () => undefined,
} as unknown as Database;

async function makeAppConfig(authEnabled: boolean, usersEnabled = true): Promise<AppConfig> {
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL },
    config: () =>
      defineConfig({
        database: { url: env('DATABASE_URL') },
        modules: {
          auth: { enabled: authEnabled, passwordMinLength: 12 },
          users: { enabled: usersEnabled, allowSelfUpdate: true },
        },
      }),
  });
}

describe('auth module (unit)', () => {
  it('validates the auth config without trusting a client-supplied enabled flag', () => {
    expect(authModuleConfigSchema.parse({ passwordMinLength: 14 })).toEqual({
      passwordMinLength: 14,
    });
    expect(() => authModuleConfigSchema.parse({ passwordMinLength: 8 })).toThrow();
  });

  it('declares the six blueprint routes and marks only logout and me as auth-only', async () => {
    const appConfig = await makeAppConfig(true);
    const usersModule = createUsersModule({ appConfig, database: fakeDatabase });
    const authModule = createAuthModule({
      appConfig,
      database: fakeDatabase,
      users: usersModule.api,
    });

    expect(authModule.routeHandlers.map((route) => `${route.method} ${route.path}`)).toEqual([
      'POST /auth/register',
      'POST /auth/login',
      'POST /auth/logout',
      'GET /auth/me',
      'POST /auth/password-reset/request',
      'POST /auth/password-reset/confirm',
    ]);
    expect(
      authModule.routeHandlers
        .filter((route) => route.requireAuth === true)
        .map((route) => `${route.method} ${route.path}`),
    ).toEqual(['POST /auth/logout', 'GET /auth/me']);
    expect(authModule.routeHandlers.every((route) => route.permission === undefined)).toBe(true);
  });

  it('omits auth routes when auth is disabled and rejects auth without users', async () => {
    const appConfig = await makeAppConfig(false);
    const usersModule = createUsersModule({ appConfig, database: fakeDatabase });
    const authModule = createAuthModule({
      appConfig,
      database: fakeDatabase,
      users: usersModule.api,
    });
    const registry = createModuleRegistry({ appConfig, database: fakeDatabase });
    registry.register(usersModule.definition);
    registry.register(authModule.definition);

    const disabledReport = await registry.activate({
      moduleConfig: appConfig.modules as unknown as ModuleConfigSource,
    });
    expect(disabledReport.routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /users/me',
      'PATCH /users/me',
    ]);

    const missingUsersRegistry = createModuleRegistry({ appConfig, database: fakeDatabase });
    missingUsersRegistry.register(authModule.definition);
    await expect(
      missingUsersRegistry.activate({
        moduleConfig: {
          ...(appConfig.modules as unknown as ModuleConfigSource),
          auth: { enabled: true, passwordMinLength: 12 },
          users: { enabled: false, allowSelfUpdate: true },
        },
      }),
    ).rejects.toThrow(/requires "users"/);
  });

  it('console email adapter never logs message bodies or tokens', async () => {
    const lines: string[] = [];
    const provider = createConsoleEmailProvider((line) => lines.push(line));

    await provider.send({
      to: 'person@example.com',
      subject: 'Password reset',
      templateId: 'password-reset',
      text: 'secret token: abc.def.ghi',
      html: '<p>secret token: abc.def.ghi</p>',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('template=password-reset');
    expect(lines[0]).toContain('to=person@example.com');
    expect(lines[0]).toContain('status=sent');
    expect(lines[0]).not.toContain('abc.def.ghi');
    expect(lines[0]).not.toContain('<p>');
  });

  it('in-memory email provider captures messages for assertions', async () => {
    const provider = createInMemoryEmailProvider();
    await provider.send({ to: 'a@example.com', subject: 's', text: 'body' });

    expect(provider.messages).toHaveLength(1);
    expect(provider.messages[0]?.to).toBe('a@example.com');
    expect(vi.isMockFunction(provider.send)).toBe(false);
  });
});
