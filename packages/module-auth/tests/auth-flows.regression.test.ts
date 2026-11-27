import { createServer } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import {
  type AuditSink,
  auditEvents,
  createDatabaseAuditSink,
  type Database,
} from '@skeletonstructure/core/database';
import { hashToken } from '@skeletonstructure/core/security';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
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
type TestApp = Awaited<ReturnType<typeof createServer>>;

interface ResponseBody {
  readonly data?: Record<string, unknown>;
  readonly error?: { readonly code?: string; readonly message?: string };
}

const PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'another-correct-horse-battery';

let container: StartedPostgreSqlContainer | undefined;
let database: Database;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  database = await initializeDatabase({
    url: container.getConnectionUri(),
    ssl: false,
    pool: { max: 5, idleTimeoutMs: 30_000, connectTimeoutMs: 10_000 },
  });
  await runAuthUsersMigrations(database);
}, 180_000);

afterEach(async () => {
  await database.db.execute(sql`DELETE FROM users_users`);
});

afterAll(async () => {
  await closeDatabase();
  await container?.stop();
}, 60_000);

async function makeConfig(): Promise<AppConfig> {
  const url = container?.getConnectionUri();
  if (url === undefined) throw new Error('PostgreSQL container is unavailable.');
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: url, RATE_LIMIT_MAX: '1000' },
    config: () =>
      defineConfig({
        app: { name: 'Auth Regression Test' },
        database: { url: env('DATABASE_URL') },
        security: { rateLimit: { max: 1_000 } },
        modules: {
          auth: { enabled: true, passwordMinLength: 12 },
          users: { enabled: true, allowSelfUpdate: true },
        },
      }),
  });
}

async function withApp<T>(
  run: (context: {
    readonly app: TestApp;
    readonly composition: AuthUsersComposition;
    readonly emailProvider: EmailProvider;
  }) => Promise<T>,
): Promise<T> {
  const appConfig = await makeConfig();
  const emailProvider = createInMemoryEmailProvider();
  const composition = await createAuthUsersComposition({ appConfig, database, emailProvider });
  const app = await createServer({
    appConfig,
    database,
    activationReport: composition.activationReport,
    routeHandlers: composition.routeHandlers,
    authenticator: composition.authenticator,
    csrfGuard: composition.csrfGuard,
  });

  try {
    return await run({ app, composition, emailProvider });
  } finally {
    await app.close();
  }
}

function bodyOf(response: { json(): unknown }): ResponseBody {
  return response.json() as ResponseBody;
}

function cookieValue(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.join(';') : typeof raw === 'string' ? raw : '';
  return header.match(/skel_session=([^;]+)/)?.[1] ?? '';
}

function stringData(body: ResponseBody, key: string): string {
  const value = body.data?.[key];
  return typeof value === 'string' ? value : '';
}

async function register(app: TestApp, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: PASSWORD },
  });
  const body = bodyOf(response);
  const user = body.data?.user as { id?: string } | undefined;
  return {
    token: cookieValue(response),
    csrfToken: stringData(body, 'csrfToken'),
    userId: user?.id ?? '',
  };
}

function cookieHeaders(token: string, csrfToken: string): Record<string, string> {
  return { cookie: `skel_session=${token}`, 'x-csrf-token': csrfToken };
}

function bearerHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function resetTokenFor(emailProvider: EmailProvider, email: string): Promise<string> {
  const message = emailProvider.messages.find((candidate) => candidate.to === email);
  const token = message?.text.match(/reset your password: ([A-Za-z0-9_-]+)/)?.[1];
  if (token === undefined) throw new Error('Password reset token was not captured.');
  return token;
}

async function auditedRows(requestId: string) {
  return database.db
    .select({
      action: auditEvents.action,
      outcome: auditEvents.outcome,
      actorId: auditEvents.actorId,
      subjectId: auditEvents.subjectId,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(eq(auditEvents.requestId, requestId));
}

function requestIdOf(response: { headers: Record<string, unknown> }): string {
  const requestId = response.headers['x-request-id'];
  if (typeof requestId !== 'string') throw new Error('Response has no request id.');
  return requestId;
}

describe('authentication security regressions', () => {
  it('rejects a rotated CSRF token replay after /auth/me', async () => {
    await withApp(async ({ app }) => {
      const session = await register(app, 'csrf-regression@example.com');

      const currentUser = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: bearerHeaders(session.token),
      });
      expect(currentUser.statusCode).toBe(200);
      const rotatedCsrf = stringData(bodyOf(currentUser), 'csrfToken');
      expect(rotatedCsrf).not.toBe(session.csrfToken);

      const replay = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: cookieHeaders(session.token, session.csrfToken),
        payload: { displayName: 'Replayed CSRF' },
      });
      expect(replay.statusCode).toBe(403);
      expect(bodyOf(replay).error?.message).toContain('CSRF');

      const current = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: cookieHeaders(session.token, rotatedCsrf),
        payload: { displayName: 'Rotated CSRF' },
      });
      expect(current.statusCode).toBe(200);
      expect(bodyOf(current).data?.displayName).toBe('Rotated CSRF');
    });
  });

  it('rejects password reset token replay and expired reset tokens', async () => {
    await withApp(async ({ app, emailProvider }) => {
      const session = await register(app, 'reset-regression@example.com');
      const request = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/request',
        payload: { email: 'reset-regression@example.com' },
      });
      expect(request.statusCode).toBe(200);
      const token = await resetTokenFor(emailProvider, 'reset-regression@example.com');

      const confirm = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: { token, password: NEW_PASSWORD },
      });
      expect(confirm.statusCode).toBe(200);

      const replay = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: { token, password: NEW_PASSWORD },
      });
      expect(replay.statusCode).toBe(400);
      expect(bodyOf(replay).error?.code).toBe('VALIDATION_ERROR');

      const expiredToken = 'expired-regression-token-with-length';
      await database.db.insert(passwordResetTokens).values({
        tokenHash: hashToken(expiredToken),
        userId: session.userId,
        expiresAt: new Date(Date.now() - 60_000),
      });
      const expired = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: { token: expiredToken, password: NEW_PASSWORD },
      });
      expect(expired.statusCode).toBe(400);
      expect(bodyOf(expired).error?.code).toBe('VALIDATION_ERROR');
    });
  });

  it('records registration with request correlation and never persists credentials', async () => {
    const appConfig = await makeConfig();
    const audit: AuditSink = createDatabaseAuditSink(database);
    const composition = await createAuthUsersComposition({
      appConfig,
      database,
      emailProvider: createInMemoryEmailProvider(),
      audit,
    });
    const app = await createServer({
      appConfig,
      database,
      activationReport: composition.activationReport,
      routeHandlers: composition.routeHandlers,
      authenticator: composition.authenticator,
      csrfGuard: composition.csrfGuard,
      auditSink: audit,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'audit-regression@example.com', password: PASSWORD },
      });
      expect(response.statusCode).toBe(200);
      const requestId = response.headers['x-request-id'];
      if (typeof requestId !== 'string') throw new Error('Response has no request id.');

      const rows = await database.db
        .select({
          action: auditEvents.action,
          outcome: auditEvents.outcome,
          requestId: auditEvents.requestId,
          actorId: auditEvents.actorId,
          metadata: auditEvents.metadata,
        })
        .from(auditEvents)
        .where(eq(auditEvents.requestId, requestId));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'auth.register',
        outcome: 'success',
        metadata: {},
      });
      expect(rows[0]?.actorId).toMatch(/^[0-9a-f-]{36}$/u);
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toContain(PASSWORD);
      expect(serialized).not.toContain('audit-regression@example.com');
    } finally {
      await app.close();
    }
  });

  it('rolls back logout when its audit event cannot be recorded', async () => {
    const appConfig = await makeConfig();
    const emailProvider = createInMemoryEmailProvider();
    const databaseAudit = createDatabaseAuditSink(database);
    const audit: AuditSink = {
      ...databaseAudit,
      async record(event, executor) {
        if (event.action === 'auth.logout') {
          throw new Error('audit store unavailable');
        }
        await databaseAudit.record(event, executor);
      },
    };
    const composition = await createAuthUsersComposition({
      appConfig,
      database,
      emailProvider,
      audit,
    });
    const app = await createServer({
      appConfig,
      database,
      activationReport: composition.activationReport,
      routeHandlers: composition.routeHandlers,
      authenticator: composition.authenticator,
      csrfGuard: composition.csrfGuard,
      auditSink: audit,
    });

    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email: 'logout-audit-failure@example.com', password: PASSWORD },
      });
      expect(registered.statusCode).toBe(200);
      const token = cookieValue(registered);

      const logout = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: cookieHeaders(token, stringData(bodyOf(registered), 'csrfToken')),
        payload: {},
      });
      expect(logout.statusCode).toBe(500);
      expect(bodyOf(logout).error?.code).toBe('INTERNAL');
      expect(await auditedRows(requestIdOf(logout))).toEqual([]);

      const sessionsAfterFailure = await database.db
        .select({ revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.tokenHash, hashToken(token)))
        .limit(1);
      expect(sessionsAfterFailure[0]?.revokedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('records auth success and failure events with request correlation', async () => {
    const email = 'audit-events@example.com';
    const appConfig = await makeConfig();
    const emailProvider = createInMemoryEmailProvider();
    const audit: AuditSink = createDatabaseAuditSink(database);
    const composition = await createAuthUsersComposition({
      appConfig,
      database,
      emailProvider,
      audit,
    });
    const app = await createServer({
      appConfig,
      database,
      activationReport: composition.activationReport,
      routeHandlers: composition.routeHandlers,
      authenticator: composition.authenticator,
      csrfGuard: composition.csrfGuard,
      auditSink: audit,
    });

    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email, password: PASSWORD },
      });
      expect(registered.statusCode).toBe(200);
      expect(await auditedRows(requestIdOf(registered))).toMatchObject([
        { action: 'auth.register', outcome: 'success' },
      ]);

      const failedLogin = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: 'wrong-password-value' },
      });
      expect(failedLogin.statusCode).toBe(401);
      expect(await auditedRows(requestIdOf(failedLogin))).toMatchObject([
        { action: 'auth.login', outcome: 'failure' },
      ]);

      const loggedIn = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: PASSWORD },
      });
      expect(loggedIn.statusCode).toBe(200);
      expect(await auditedRows(requestIdOf(loggedIn))).toMatchObject([
        { action: 'auth.login', outcome: 'success' },
      ]);
      const logout = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: cookieHeaders(cookieValue(loggedIn), stringData(bodyOf(loggedIn), 'csrfToken')),
        payload: {},
      });
      expect(logout.statusCode).toBe(200);
      expect(await auditedRows(requestIdOf(logout))).toMatchObject([
        { action: 'auth.logout', outcome: 'success' },
      ]);

      const missingAccount = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/request',
        payload: { email: 'missing@example.com' },
      });
      expect(missingAccount.statusCode).toBe(200);
      expect(await auditedRows(requestIdOf(missingAccount))).toMatchObject([
        { action: 'auth.password_reset.request', outcome: 'failure' },
      ]);

      const resetRequested = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/request',
        payload: { email },
      });
      expect(resetRequested.statusCode).toBe(200);
      expect(await auditedRows(requestIdOf(resetRequested))).toMatchObject([
        { action: 'auth.password_reset.request', outcome: 'success' },
      ]);

      const badConfirm = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: { token: 'x'.repeat(40), password: NEW_PASSWORD },
      });
      expect(badConfirm.statusCode).toBe(400);
      expect(await auditedRows(requestIdOf(badConfirm))).toMatchObject([
        { action: 'auth.password_reset.confirm', outcome: 'failure' },
      ]);

      const confirmed = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset/confirm',
        payload: {
          token: await resetTokenFor(emailProvider, email),
          password: NEW_PASSWORD,
        },
      });
      expect(confirmed.statusCode).toBe(200);
      expect(await auditedRows(requestIdOf(confirmed))).toMatchObject([
        { action: 'auth.password_reset.confirm', outcome: 'success' },
      ]);
    } finally {
      await app.close();
    }
  });
});
