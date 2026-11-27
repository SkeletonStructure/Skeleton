import { describe, expect, it } from 'vitest';

import {
  type RateLimitStore,
  type RateLimitStoreProvider,
  resolveApiServerOptions,
} from '../../src/api/index.js';
import type { AppConfig } from '../../src/config/index.js';
import type { AuditSink } from '../../src/database/index.js';
import { createLifecycle } from '../../src/lifecycle/index.js';
import { createLogger } from '../../src/logging/index.js';
import type { ActivationReport } from '../../src/modules/index.js';
import {
  fakeDatabase,
  fixtureHandlers,
  fixtureReport,
  makeAppConfig,
  withServer,
} from './helpers.js';

const PUBLIC_ROUTE_REPORT: ActivationReport = {
  enabled: [],
  disabled: [],
  order: [],
  permissions: [],
  routes: [{ moduleId: 'fixture', method: 'GET', path: '/public' }],
  ports: [],
};

function failingRateLimitStore(): RateLimitStoreProvider {
  const store: RateLimitStore = {
    incr: (_key, callback) => callback(new Error('store unavailable')),
    child() {
      return this;
    },
  };
  return {
    id: 'memory',
    createStore: () => store,
    health: async () => ({ status: 'error', reason: 'RATE_LIMIT_STORE_UNAVAILABLE' }),
  };
}

function failingAuditSink(): AuditSink {
  return {
    record: async () => {
      throw new Error('audit unavailable');
    },
    health: async () => ({ status: 'error', reason: 'AUDIT_STORE_UNAVAILABLE' }),
  };
}

describe('security infrastructure failure behavior', () => {
  it('correlates structured request logs without recording queries or credentials', async () => {
    const appConfig: AppConfig = await makeAppConfig();
    const lines: string[] = [];
    const logger = createLogger({
      ...appConfig.logging,
      sink: (line) => lines.push(line),
    });

    await withServer(
      {
        appConfig,
        logger,
        activationReport: PUBLIC_ROUTE_REPORT,
        routeHandlers: [
          {
            moduleId: 'fixture',
            method: 'GET',
            path: '/public',
            handler: async (request) => {
              request.logger.error('credential.attempt', {
                password: 'password-value',
                authorization: 'Bearer token-value',
              });
              return { ok: true };
            },
          },
        ],
      },
      async (app) => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/public?api_key=query-secret',
          headers: { authorization: 'Bearer header-secret' },
        });
        expect(response.statusCode).toBe(200);

        const serialized = JSON.stringify(lines);
        expect(serialized).toContain('req_');
        expect(serialized).toContain('http.request_completed');
        expect(serialized).not.toContain('query-secret');
        expect(serialized).not.toContain('header-secret');
        expect(serialized).not.toContain('password-value');
        expect(serialized).not.toContain('token-value');
        expect(serialized).toContain('[REDACTED]');

        const completion = lines
          .map((line) => JSON.parse(line) as { fields?: { requestId?: string } })
          .find((line) => line.fields?.requestId !== undefined);
        expect(completion?.fields?.requestId).toBe(response.headers['x-request-id']);
      },
    );
  });

  it('fails closed when shared rate-limit storage errors', async () => {
    const appConfig = await makeAppConfig();

    await withServer({ appConfig, rateLimitStore: failingRateLimitStore() }, async (app) => {
      const response = await app.inject({ method: 'GET', url: '/v1/config/public' });
      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL');
    });
  });

  it('reports rate-limit storage as unready', async () => {
    const appConfig = await makeAppConfig();

    await withServer(
      { appConfig, database: fakeDatabase(), rateLimitStore: failingRateLimitStore() },
      async (app) => {
        const response = await app.inject({ method: 'GET', url: '/health/ready' });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ reason: 'RATE_LIMIT_STORE_UNAVAILABLE' });
      },
    );
  });

  it('fails closed when an audit write fails during authorization', async () => {
    const appConfig = await makeAppConfig();

    await withServer(
      {
        appConfig,
        activationReport: fixtureReport(),
        routeHandlers: fixtureHandlers(),
        authenticator: { authenticate: async () => undefined },
        auditSink: failingAuditSink(),
      },
      async (app) => {
        const response = await app.inject({ method: 'GET', url: '/v1/fixture' });
        expect(response.statusCode).toBe(500);
        expect(response.json().error.code).toBe('INTERNAL');
      },
    );
  });

  it('reports an unavailable audit sink as unready', async () => {
    const appConfig = await makeAppConfig();

    await withServer(
      { appConfig, database: fakeDatabase(), auditSink: failingAuditSink() },
      async (app) => {
        const response = await app.inject({ method: 'GET', url: '/health/ready' });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ reason: 'AUDIT_STORE_UNAVAILABLE' });
      },
    );
  });

  it('reports lifecycle transitions through readiness', async () => {
    const appConfig = await makeAppConfig();
    const lifecycle = createLifecycle();

    await withServer({ appConfig, database: fakeDatabase(), lifecycle }, async (app) => {
      const starting = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(starting.statusCode).toBe(503);
      expect(starting.json()).toMatchObject({ reason: 'SERVICE_STARTING' });

      lifecycle.markReady();
      const ready = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(ready.statusCode).toBe(200);

      lifecycle.markDraining();
      const draining = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(draining.statusCode).toBe(503);
      expect(draining.json()).toMatchObject({ reason: 'SERVICE_DRAINING' });
    });
  });

  it('reserves the lifecycle readiness id for core', async () => {
    const appConfig = await makeAppConfig();

    expect(() =>
      resolveApiServerOptions({
        appConfig,
        migrationCheck: { id: 'lifecycle', check: () => ({ status: 'ok' }) },
      }),
    ).toThrow(/reserved by core/u);
  });
});
