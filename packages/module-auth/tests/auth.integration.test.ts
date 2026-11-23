import { createServer } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import { hashToken } from '@skeletonstructure/core/security';
import { rolePermissions, userRoles, users as usersTable } from '@skeletonstructure/module-users';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineConfig, env, loadConfig } from '../../core/src/config/index.js';
import { closeDatabase, initializeDatabase } from '../../core/src/database/index.js';

import {
  type AuthUsersComposition,
  createAuthUsersComposition,
  createInMemoryEmailProvider,
  passwordResetTokens,
  runAuthUsersMigrations,
  sessions,
} from '../src/index.js';

type EmailProvider = ReturnType<typeof createInMemoryEmailProvider>;

interface ResponseBody {
  readonly data?: Record<string, unknown>;
  readonly error?: { readonly code?: string; readonly message?: string };
}

let container: StartedPostgreSqlContainer | undefined;
let database: Database;

const PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'another-correct-horse-battery';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  database = await initializeDatabase({
    url: container.getConnectionUri(),
    ssl: false,
    pool: { max: 10, idleTimeoutMs: 30_000, connectTimeoutMs: 10_000 },
  });
  await runAuthUsersMigrations(database);
  expect((await runAuthUsersMigrations(database)).auth.upToDate).toBe(true);
}, 180_000);

afterEach(async () => {
  await database.db.execute(sql`DELETE FROM users_users`);
}, 60_000);

afterAll(async () => {
  await closeDatabase();
  await container?.stop();
}, 60_000);

async function makeConfig(production = false): Promise<AppConfig> {
  const url = container?.getConnectionUri();
  if (url === undefined) throw new Error('PostgreSQL container is unavailable.');
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: url },
    config: () =>
      defineConfig({
        app: { name: 'Auth Test', env: production ? 'production' : 'development' },
        database: { url: env('DATABASE_URL') },
        security: { sessionCookie: { secure: production } },
        modules: {
          auth: { enabled: true, passwordMinLength: 12 },
          users: { enabled: true, allowSelfUpdate: true },
        },
      }),
  });
}

async function withApp<T>(
  run: (context: {
    readonly app: Awaited<ReturnType<typeof createServer>>;
    readonly composition: AuthUsersComposition;
    readonly emailProvider: EmailProvider;
    readonly appConfig: AppConfig;
  }) => Promise<T>,
  options: { readonly production?: boolean; readonly moduleConfig?: Record<string, unknown> } = {},
): Promise<T> {
  const appConfig = await makeConfig(options.production === true);
  const emailProvider = createInMemoryEmailProvider();
  const composition = await createAuthUsersComposition({
    appConfig,
    database,
    emailProvider,
    ...(options.moduleConfig === undefined ? {} : { moduleConfig: options.moduleConfig as never }),
  });
  const app = await createServer({
    appConfig,
    database,
    activationReport: composition.activationReport,
    routeHandlers: composition.routeHandlers,
    authenticator: composition.authenticator,
    csrfGuard: composition.csrfGuard,
  });

  try {
    return await run({ app, composition, emailProvider, appConfig });
  } finally {
    await app.close();
  }
}

function bodyOf(response: { json(): unknown }): ResponseBody {
  return response.json() as ResponseBody;
}

function cookieValue(response: { headers: Record<string, unknown> }): string | undefined {
  const raw = response.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.join(';') : typeof raw === 'string' ? raw : '';
  return header.match(/skel_session=([^;]+)/)?.[1];
}

function authHeaders(token: string, csrfToken?: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...(csrfToken === undefined ? {} : { 'x-csrf-token': csrfToken }),
  };
}

function cookieHeaders(token: string, csrfToken?: string): Record<string, string> {
  return {
    cookie: `skel_session=${token}`,
    ...(csrfToken === undefined ? {} : { 'x-csrf-token': csrfToken }),
  };
}

function stringData(body: ResponseBody, key: string): string {
  const value = body.data?.[key];
  return typeof value === 'string' ? value : '';
}

async function register(
  app: Awaited<ReturnType<typeof createServer>>,
  email: string,
  password: string,
) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password },
  });
  const body = bodyOf(response);
  return {
    response,
    token: cookieValue(response) ?? '',
    csrfToken: stringData(body, 'csrfToken'),
    userId: (body.data?.user as { id?: string } | undefined)?.id ?? '',
  };
}

async function resetTokenFor(emailProvider: EmailProvider, email: string): Promise<string> {
  const message = emailProvider.messages.find((candidate) => candidate.to === email);
  const token = message?.text.match(/reset your password: ([A-Za-z0-9_-]+)/)?.[1];
  if (token === undefined) throw new Error('Password reset token was not captured.');
  return token;
}

describe('auth and users modules (Fastify + PostgreSQL integration)', () => {
  it('registers, authenticates, and returns current user without leaking secrets', async () => {
    await withApp(async ({ app }) => {
      const registration = await register(app, 'owner@example.com', PASSWORD);
      expect(registration.response.statusCode).toBe(200);
      expect(registration.token).not.toBe('');
      expect(cookieValue(registration.response)).toBe(registration.token);
      expect(JSON.stringify(bodyOf(registration.response))).not.toContain(registration.token);
      expect(registration.response.headers['set-cookie']).toMatch(/HttpOnly/i);
      expect(registration.response.headers['set-cookie']).toMatch(/SameSite=Lax/i);

      const me = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: authHeaders(registration.token),
      });
      expect(me.statusCode).toBe(200);
      expect(bodyOf(me).data?.user).toMatchObject({ email: 'owner@example.com' });
      expect(bodyOf(me).data?.permissions).toEqual(['users:read:self', 'users:update:self']);

      const storedSessions = await database.db.select().from(sessions);
      expect(storedSessions).toHaveLength(1);
      expect(storedSessions[0]?.tokenHash).toBe(hashToken(registration.token));
      expect(JSON.stringify(storedSessions)).not.toContain(registration.token);

      const storedUsers = await database.db.select().from(usersTable);
      expect(storedUsers[0]?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(storedUsers[0]?.passwordHash).not.toContain(PASSWORD);
    });
  });

  it('rejects invalid and duplicate registration input safely', async () => {
    await withApp(async ({ app }) => {
      const short = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'short@example.com', password: 'too-short' },
      });
      expect(short.statusCode).toBe(400);
      expect(bodyOf(short).error?.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(bodyOf(short))).toContain('password');

      await register(app, 'duplicate@example.com', PASSWORD);
      const duplicate = await register(app, 'DUPLICATE@example.com', PASSWORD);
      expect(duplicate.response.statusCode).toBe(409);
      expect(bodyOf(duplicate.response).error?.code).toBe('CONFLICT');
      expect(JSON.stringify(duplicate.response.body)).not.toContain(PASSWORD);
      expect(await database.db.select().from(sessions)).toHaveLength(1);
    });
  });

  it('logs in with generic failures and rotates the session token', async () => {
    await withApp(async ({ app }) => {
      const registration = await register(app, 'login@example.com', PASSWORD);

      const wrong = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'login@example.com', password: 'wrong-password-long' },
      });
      expect(wrong.statusCode).toBe(401);
      expect(bodyOf(wrong).error).toMatchObject({
        code: 'UNAUTHENTICATED',
        message: 'Invalid email or password.',
      });

      const unknown = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'missing@example.com', password: 'wrong-password-long' },
      });
      expect(unknown.statusCode).toBe(401);
      expect(bodyOf(unknown).error?.code).toBe(bodyOf(wrong).error?.code);
      expect(bodyOf(unknown).error?.message).toBe(bodyOf(wrong).error?.message);

      const login = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: cookieHeaders(registration.token, registration.csrfToken),
        payload: { email: 'login@example.com', password: PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      const rotatedToken = cookieValue(login) ?? '';
      expect(rotatedToken).not.toBe(registration.token);
      expect(JSON.stringify(bodyOf(login))).not.toContain(rotatedToken);

      const oldSession = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: authHeaders(registration.token),
      });
      expect(oldSession.statusCode).toBe(401);

      const newSession = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: authHeaders(rotatedToken),
      });
      expect(newSession.statusCode).toBe(200);
    });
  });

  it('logs out and revokes the current session', async () => {
    await withApp(async ({ app }) => {
      const registration = await register(app, 'logout@example.com', PASSWORD);
      const me = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: authHeaders(registration.token),
      });
      const rotatedCsrf = stringData(bodyOf(me), 'csrfToken');

      const logout = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: cookieHeaders(registration.token, rotatedCsrf),
      });
      expect(logout.statusCode).toBe(200);

      const after = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: authHeaders(registration.token),
      });
      expect(after.statusCode).toBe(401);
    });
  });

  it('requires CSRF for cookie mutations and allows bearer-only mutations', async () => {
    await withApp(async ({ app }) => {
      const registration = await register(app, 'csrf@example.com', PASSWORD);

      const missing = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: cookieHeaders(registration.token),
        payload: { displayName: 'No CSRF' },
      });
      expect(missing.statusCode).toBe(403);
      expect(bodyOf(missing).error?.message).toContain('CSRF');

      const allowed = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: cookieHeaders(registration.token, registration.csrfToken),
        payload: { displayName: 'With CSRF' },
      });
      expect(allowed.statusCode).toBe(200);
      expect(bodyOf(allowed).data?.displayName).toBe('With CSRF');

      const rotated = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: authHeaders(registration.token),
      });
      const nextCsrf = stringData(bodyOf(rotated), 'csrfToken');
      expect(nextCsrf).not.toBe(registration.csrfToken);

      const replay = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: cookieHeaders(registration.token, registration.csrfToken),
        payload: { displayName: 'Replay' },
      });
      expect(replay.statusCode).toBe(403);

      const bearer = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: authHeaders(registration.token),
        payload: { displayName: 'Bearer Only' },
      });
      expect(bearer.statusCode).toBe(200);
    });
  });

  it('does not reveal whether a reset account exists and hashes reset tokens', async () => {
    await withApp(async ({ app, emailProvider }) => {
      await register(app, 'reset@example.com', PASSWORD);

      const known = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/request',
        payload: { email: 'reset@example.com' },
      });
      const unknown = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/request',
        payload: { email: 'nobody@example.com' },
      });

      expect(known.statusCode).toBe(200);
      expect(unknown.statusCode).toBe(200);
      expect(bodyOf(known).data?.message).toBe(bodyOf(unknown).data?.message);
      expect(emailProvider.messages).toHaveLength(2);
      expect(emailProvider.messages.map((message) => message.templateId)).toEqual([
        'password-reset',
        'password-reset',
      ]);

      const token = await resetTokenFor(emailProvider, 'reset@example.com');
      const stored = await database.db.select().from(passwordResetTokens);
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(stored)).not.toContain(token);
      expect(emailProvider.messages[1]?.text).not.toContain('reset your password:');
    });
  });

  it('confirms a reset once, invalidates old sessions, and rejects token replay', async () => {
    await withApp(async ({ app, emailProvider }) => {
      const registration = await register(app, 'confirm@example.com', PASSWORD);
      await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/request',
        payload: { email: 'confirm@example.com' },
      });
      const token = await resetTokenFor(emailProvider, 'confirm@example.com');

      const confirm = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: { token, password: NEW_PASSWORD },
      });
      expect(confirm.statusCode).toBe(200);
      const rotatedToken = cookieValue(confirm) ?? '';
      expect(rotatedToken).not.toBe(registration.token);

      const oldSession = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: authHeaders(registration.token),
      });
      expect(oldSession.statusCode).toBe(401);

      const replay = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: { token, password: NEW_PASSWORD },
      });
      expect(replay.statusCode).toBe(400);
      expect(bodyOf(replay).error?.code).toBe('VALIDATION_ERROR');

      const oldPassword = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'confirm@example.com', password: PASSWORD },
      });
      expect(oldPassword.statusCode).toBe(401);
      const newPassword = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'confirm@example.com', password: NEW_PASSWORD },
      });
      expect(newPassword.statusCode).toBe(200);
    });
  });

  it('allows only one concurrent reset confirmation', async () => {
    await withApp(async ({ app, emailProvider }) => {
      await register(app, 'concurrent@example.com', PASSWORD);
      await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/request',
        payload: { email: 'concurrent@example.com' },
      });
      const token = await resetTokenFor(emailProvider, 'concurrent@example.com');

      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/v1/auth/password-reset/confirm',
          payload: { token, password: NEW_PASSWORD },
        }),
        app.inject({
          method: 'POST',
          url: '/v1/auth/password-reset/confirm',
          payload: { token, password: NEW_PASSWORD },
        }),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 400]);
      const used = await database.db.select().from(passwordResetTokens);
      expect(used).toHaveLength(1);
      expect(used[0]?.usedAt).toBeInstanceOf(Date);
    });
  });

  it('rejects expired reset tokens', async () => {
    await withApp(async ({ app, composition }) => {
      const registration = await register(app, 'expired@example.com', PASSWORD);
      const token = 'expired-token-with-sufficient-length';
      await database.db.insert(passwordResetTokens).values({
        tokenHash: hashToken(token),
        userId: registration.userId,
        expiresAt: new Date(Date.now() - 60_000),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: { token, password: NEW_PASSWORD },
      });
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response).error?.code).toBe('VALIDATION_ERROR');
      expect(composition.auth).toBeDefined();
    });
  });

  it('enforces an authorization matrix with explicit ownership and roles', async () => {
    await withApp(async ({ app, composition }) => {
      const anonymous = await app.inject({ method: 'GET', url: '/v1/users/me' });
      expect(anonymous.statusCode).toBe(401);

      const owner = await register(app, 'owner-matrix@example.com', PASSWORD);
      await database.db.delete(userRoles).where(sql`user_id = ${owner.userId}`);
      await database.db
        .insert(rolePermissions)
        .values({ role: 'role_a', permission: 'users:read:self' })
        .onConflictDoNothing();
      await database.db.insert(userRoles).values({ userId: owner.userId, role: 'role_a' });

      const roleARead = await app.inject({
        method: 'GET',
        url: '/v1/users/me',
        headers: authHeaders(owner.token),
      });
      expect(roleARead.statusCode).toBe(200);

      const roleAUpdate = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: authHeaders(owner.token),
        payload: { displayName: 'Role A' },
      });
      expect(roleAUpdate.statusCode).toBe(403);

      const other = await register(app, 'other-matrix@example.com', PASSWORD);
      await database.db.delete(userRoles).where(sql`user_id = ${other.userId}`);
      await database.db
        .insert(rolePermissions)
        .values({ role: 'role_b', permission: 'users:update:self' })
        .onConflictDoNothing();
      await database.db.insert(userRoles).values({ userId: other.userId, role: 'role_b' });

      const roleBUpdate = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: authHeaders(other.token),
        payload: { displayName: 'Role B' },
      });
      expect(roleBUpdate.statusCode).toBe(200);

      const roleBRead = await app.inject({
        method: 'GET',
        url: '/v1/users/me',
        headers: authHeaders(other.token),
      });
      expect(roleBRead.statusCode).toBe(403);

      await expect(
        composition.users.getOwnedProfile(owner.userId, other.userId),
      ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });
  });

  it('omits protected routes instead of exposing them when modules are disabled', async () => {
    await withApp(
      async ({ app }) => {
        for (const url of ['/v1/auth/me', '/v1/users/me', '/v1/auth/register']) {
          const response = await app.inject({ method: 'GET', url });
          expect(response.statusCode).toBe(404);
        }
      },
      {
        moduleConfig: {
          auth: { enabled: false, passwordMinLength: 12 },
          users: { enabled: false, allowSelfUpdate: true },
        },
      },
    );
  });

  it('sets Secure cookies in production configuration', async () => {
    await withApp(
      async ({ app }) => {
        const registration = await register(app, 'secure@example.com', PASSWORD);
        expect(registration.response.statusCode).toBe(200);
        expect(registration.response.headers['set-cookie']).toMatch(/Secure/i);
      },
      { production: true },
    );
  });

  it('applies stricter rate limits to auth endpoints', async () => {
    await withApp(async ({ app }) => {
      const statuses: number[] = [];
      for (let index = 0; index < 11; index += 1) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/auth/password-reset/request',
          payload: { email: `rate${index}@example.com` },
        });
        statuses.push(response.statusCode);
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
    });
  });

  it('cleans expired sessions and finished reset tokens', async () => {
    await withApp(async ({ app, composition }) => {
      const registration = await register(app, 'cleanup@example.com', PASSWORD);
      const staleToken = 'stale-session-token-with-length';
      await database.db.insert(sessions).values({
        tokenHash: hashToken(staleToken),
        userId: registration.userId,
        csrfHash: hashToken('csrf'),
        expiresAt: new Date(Date.now() - 60_000),
      });
      await database.db.insert(passwordResetTokens).values({
        tokenHash: hashToken('finished-reset-token-with-length'),
        userId: registration.userId,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      });

      const report = await composition.auth.cleanupExpired();
      expect(report.sessionsDeleted).toBeGreaterThanOrEqual(1);
      expect(report.resetTokensDeleted).toBe(1);

      const remaining = await database.db.select().from(sessions);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.tokenHash).toBe(hashToken(registration.token));
    });
  });
});
