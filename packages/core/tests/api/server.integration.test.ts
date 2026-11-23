import { describe, expect, it } from 'vitest';

import {
  type ApiRouteDefinition,
  createServer,
  generateOpenApiDocument,
} from '../../src/api/index.js';
import type { AppConfig } from '../../src/config/index.js';
import type { ActivationReport } from '../../src/modules/index.js';
import {
  fakeDatabase,
  fixtureHandlers,
  fixtureReport,
  makeAppConfig,
  VALID_DATABASE_URL,
  withServer,
} from './helpers.js';

describe('API server (integration)', () => {
  it('returns the success envelope and request id for a module route', async () => {
    const appConfig = await makeAppConfig();

    await withServer(
      {
        appConfig,
        activationReport: fixtureReport(),
        routeHandlers: fixtureHandlers(),
        authenticator: {
          authenticate: async () => ({ id: 'user_1', permissions: ['fixture:read'] }),
        },
      },
      async (app) => {
        const response = await app.inject({ method: 'GET', url: '/v1/fixture' });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body).toEqual({
          data: { ok: true },
          meta: { requestId: expect.any(String) },
        });
        expect(response.headers['x-request-id']).toBe(body.meta.requestId);
      },
    );
  });

  it('maps invalid request bodies to 400 VALIDATION_ERROR with field details', async () => {
    const appConfig = await makeAppConfig();
    const report: ActivationReport = {
      enabled: [],
      disabled: [],
      order: [],
      permissions: [],
      routes: [{ moduleId: 'fixture', method: 'POST', path: '/validate' }],
      ports: [],
    };
    const handlers: readonly ApiRouteDefinition[] = [
      {
        moduleId: 'fixture',
        method: 'POST',
        path: '/validate',
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['email'],
            properties: { email: { type: 'string', minLength: 3 } },
          },
        },
        handler: async () => ({ ok: true }),
      },
    ];

    await withServer(
      { appConfig, activationReport: report, routeHandlers: handlers },
      async (app) => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/validate',
          payload: {},
        });
        const body = response.json();

        expect(response.statusCode).toBe(400);
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.message).toBe('Request validation failed.');
        expect(body.error.details).toEqual([{ path: 'email', message: expect.any(String) }]);
        expect(body.error.requestId).toBe(response.headers['x-request-id']);
      },
    );
  });

  it('fails startup when a route declares an unknown permission', async () => {
    const appConfig = await makeAppConfig();
    const report = fixtureReport('fixture:read');
    const brokenReport: ActivationReport = {
      ...report,
      routes: [
        {
          moduleId: 'fixture',
          method: 'GET',
          path: '/fixture',
          permission: 'fixture:missing',
        },
      ],
    };

    await expect(
      createServer({
        appConfig,
        activationReport: brokenReport,
        routeHandlers: fixtureHandlers('fixture:missing'),
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_ROUTE_PERMISSION' });
  });

  it('returns 500 INTERNAL without stack traces or secrets for unexpected errors', async () => {
    const appConfig = await makeAppConfig();
    const report: ActivationReport = {
      enabled: [],
      disabled: [],
      order: [],
      permissions: [],
      routes: [{ moduleId: 'fixture', method: 'GET', path: '/boom' }],
      ports: [],
    };
    const handlers: readonly ApiRouteDefinition[] = [
      {
        moduleId: 'fixture',
        method: 'GET',
        path: '/boom',
        handler: () => {
          throw new Error(`stack trace ${VALID_DATABASE_URL} /home/mehir/secret.ts`);
        },
      },
    ];

    await withServer(
      { appConfig, activationReport: report, routeHandlers: handlers },
      async (app) => {
        const response = await app.inject({ method: 'GET', url: '/v1/boom' });
        const body = response.json();

        expect(response.statusCode).toBe(500);
        expect(body.error.code).toBe('INTERNAL');
        expect(body.error.message).toBe('An unexpected error occurred.');
        expect(typeof body.error.requestId).toBe('string');
        expect(response.body).not.toContain('stack trace');
        expect(response.body).not.toContain('secret.ts');
        expect(response.body).not.toContain(VALID_DATABASE_URL);
      },
    );
  });

  it('returns 404 NOT_FOUND for unknown routes with a request id', async () => {
    const appConfig = await makeAppConfig();

    await withServer({ appConfig }, async (app) => {
      const response = await app.inject({ method: 'GET', url: '/v1/missing' });
      const body = response.json();

      expect(response.statusCode).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.requestId).toBe(response.headers['x-request-id']);
    });
  });

  it('serves liveness without dependency checks', async () => {
    const appConfig = await makeAppConfig();

    await withServer({ appConfig }, async (app) => {
      const response = await app.inject({ method: 'GET', url: '/health/live' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  it('serves readiness from the injected database health', async () => {
    const appConfig = await makeAppConfig();

    await withServer({ appConfig, database: fakeDatabase() }, async (app) => {
      const ready = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toEqual({ status: 'ok' });
    });

    await withServer(
      {
        appConfig,
        database: fakeDatabase({ status: 'error', reason: 'DATABASE_UNAVAILABLE' }),
      },
      async (app) => {
        const unready = await app.inject({ method: 'GET', url: '/health/ready' });
        expect(unready.statusCode).toBe(503);
        expect(unready.json()).toMatchObject({
          status: 'error',
          reason: 'DATABASE_UNAVAILABLE',
          requestId: expect.any(String),
        });
      },
    );
  });

  it('fails readiness for a pending migration check without exposing details', async () => {
    const appConfig = await makeAppConfig();

    await withServer(
      {
        appConfig,
        database: fakeDatabase(),
        migrationCheck: {
          id: 'migration',
          check: () => ({ status: 'error', reason: 'MIGRATIONS_PENDING' }),
        },
      },
      async (app) => {
        const response = await app.inject({ method: 'GET', url: '/health/ready' });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({
          status: 'error',
          reason: 'MIGRATIONS_PENDING',
        });
        expect(response.body).not.toContain('password');
      },
    );
  });

  it('enforces declared permissions through the global hook', async () => {
    const appConfig = await makeAppConfig();
    const options = {
      appConfig,
      activationReport: fixtureReport(),
      routeHandlers: fixtureHandlers(),
    } as const;

    await withServer(options, async (app) => {
      const anonymous = await app.inject({ method: 'GET', url: '/v1/fixture' });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json().error.code).toBe('UNAUTHENTICATED');
    });

    await withServer(
      {
        ...options,
        authenticator: {
          authenticate: async () => ({ id: 'user_1', permissions: ['other:permission'] }),
        },
      },
      async (app) => {
        const forbidden = await app.inject({ method: 'GET', url: '/v1/fixture' });
        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.json().error.code).toBe('FORBIDDEN');
      },
    );

    await withServer(
      {
        ...options,
        authenticator: {
          authenticate: async () => ({ id: 'user_1', permissions: ['fixture:read'] }),
        },
      },
      async (app) => {
        const allowed = await app.inject({ method: 'GET', url: '/v1/fixture' });
        expect(allowed.statusCode).toBe(200);
      },
    );
  });

  it('emits exact-origin CORS headers and never wildcard credentials', async () => {
    const explicit = await makeAppConfig({
      origins: ['https://app.example.com'],
      credentials: true,
    });

    await withServer({ appConfig: explicit }, async (app) => {
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/v1/config/public',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': 'GET',
        },
      });
      expect(preflight.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    });

    const sameOrigin = await makeAppConfig({ origins: [] });
    await withServer({ appConfig: sameOrigin }, async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/config/public',
        headers: { origin: 'https://evil.example' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    const wildcard = {
      ...explicit,
      security: {
        ...explicit.security,
        cors: { ...explicit.security.cors, origins: ['*'], credentials: true },
      },
    } as AppConfig;
    await expect(createServer({ appConfig: wildcard })).rejects.toMatchObject({
      code: 'CORS_WILDCARD_ORIGIN',
    });
  });

  it('applies the configured per-process rate limit', async () => {
    const appConfig = await makeAppConfig({ rateLimitMax: 2, rateLimitWindowMs: 60_000 });

    await withServer({ appConfig }, async (app) => {
      const first = await app.inject({ method: 'GET', url: '/v1/config/public' });
      const second = await app.inject({ method: 'GET', url: '/v1/config/public' });
      const third = await app.inject({ method: 'GET', url: '/v1/config/public' });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(third.statusCode).toBe(429);
      expect(third.json().error).toMatchObject({
        code: 'RATE_LIMITED',
        requestId: expect.any(String),
      });
    });
  });

  it('serves only allowlisted public config fields', async () => {
    const appConfig = await makeAppConfig({ appName: 'Fixture App' });

    await withServer(
      { appConfig, activationReport: fixtureReport(), routeHandlers: fixtureHandlers() },
      async (app) => {
        const response = await app.inject({ method: 'GET', url: '/v1/config/public' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          data: {
            appName: 'Fixture App',
            apiBaseUrl: '/v1',
            authMode: 'session',
            publicModules: ['fixture'],
          },
          meta: { requestId: expect.any(String) },
        });
        expect(response.body).not.toContain(VALID_DATABASE_URL);
      },
    );
  });

  it('generates a public OpenAPI document without internal health routes', async () => {
    const appConfig = await makeAppConfig();
    const document = await generateOpenApiDocument({
      appConfig,
      activationReport: fixtureReport(),
      routeHandlers: fixtureHandlers(),
    });

    expect(document.openapi).toBe('3.1.0');
    const paths = Object.keys((document.paths ?? {}) as Record<string, unknown>);
    expect(paths).toContain('/v1/config/public');
    expect(paths).toContain('/v1/fixture');
    expect(paths).not.toContain('/health/live');
    expect(paths).not.toContain('/health/ready');
  });
});
