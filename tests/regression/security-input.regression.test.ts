import { defineConfig, env, loadConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import { createAuthService, createInMemoryEmailProvider } from '@skeletonstructure/module-auth';
import { createUsersModule, isValidEmail } from '@skeletonstructure/module-users';
import { describe, expect, it } from 'vitest';

const DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';

const fakeDatabase = {
  db: {},
  transaction: async (fn: (tx: never) => Promise<unknown>) => fn({} as never),
  health: async () => ({ status: 'ok' }),
  migrate: async () => ({ appliedCount: 0, upToDate: true }),
  close: async () => undefined,
} as unknown as Database;

describe('security input regressions', () => {
  it('preserves legacy email acceptance while handling pathological input', () => {
    expect(isValidEmail('person@example.com')).toBe(true);
    expect(isValidEmail('person@example')).toBe(false);
    expect(isValidEmail('person @example.com')).toBe(false);
    expect(isValidEmail('a@b.c.')).toBe(true);
    expect(isValidEmail('a@b.c..')).toBe(true);
    expect(isValidEmail('a@..b')).toBe(true);
    expect(isValidEmail(`person@example.${'x'.repeat(5_000)}`)).toBe(false);
    expect(isValidEmail(`a${'@'.repeat(5_000)}b.com`)).toBe(false);
  });

  it('parses bearer headers with long whitespace runs', async () => {
    const appConfig = await loadConfig({
      envFiles: false,
      environment: { DATABASE_URL },
      config: () =>
        defineConfig({
          database: { url: env('DATABASE_URL') },
          modules: {
            auth: { enabled: true, passwordMinLength: 12 },
            users: { enabled: true, allowSelfUpdate: true },
          },
        }),
    });
    const users = createUsersModule({ appConfig, database: fakeDatabase }).api;
    const service = createAuthService({
      appConfig,
      database: fakeDatabase,
      users,
      emailProvider: createInMemoryEmailProvider(),
    });

    expect(
      service.presentedToken({
        method: 'GET',
        headers: { authorization: `Bearer${' '.repeat(5_000)}token-123` },
      }),
    ).toBe('token-123');
    expect(
      service.presentedToken({
        method: 'GET',
        headers: { authorization: 'bearer\ttab-token' },
      }),
    ).toBe('tab-token');
    expect(
      service.presentedToken({
        method: 'GET',
        headers: { authorization: 'Bearertoken-without-space' },
      }),
    ).toBeUndefined();
  });
});
