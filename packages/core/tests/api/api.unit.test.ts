import { describe, expect, it } from 'vitest';

import {
  ApiConfigurationError,
  buildPublicConfig,
  emptyActivationReport,
  evaluateReadiness,
  mapRequestError,
  resolveApiServerOptions,
} from '../../src/api/index.js';
import type { AppConfig } from '../../src/config/index.js';
import type { ActivationReport } from '../../src/modules/index.js';
import {
  fakeDatabase,
  fixtureHandlers,
  fixtureReport,
  makeAppConfig,
  VALID_DATABASE_URL,
} from './helpers.js';

describe('API error mapping (unit)', () => {
  it('maps Fastify validation issues to field details without raw input', () => {
    const mapped = mapRequestError(
      {
        statusCode: 400,
        validation: [
          {
            instancePath: '/email',
            message: 'must be string',
          },
        ],
      },
      'req_test',
    );

    expect(mapped.statusCode).toBe(400);
    expect(mapped.body.error.code).toBe('VALIDATION_ERROR');
    expect(mapped.body.error.requestId).toBe('req_test');
    expect(mapped.body.error.details).toEqual([{ path: 'email', message: 'must be string' }]);
    expect(JSON.stringify(mapped.body)).not.toContain('stack');
  });

  it('maps unexpected errors to a generic 500 with requestId', () => {
    const mapped = mapRequestError(
      new Error(`DATABASE_URL=${VALID_DATABASE_URL}\nat /home/mehir/secret.ts`),
      'req_internal',
    );

    expect(mapped.statusCode).toBe(500);
    expect(mapped.body.error.code).toBe('INTERNAL');
    expect(mapped.body.error.requestId).toBe('req_internal');
    expect(mapped.body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(mapped.body)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(mapped.body)).not.toContain('secret.ts');
  });

  it('preserves safe fields on explicit HTTP errors', () => {
    const mapped = mapRequestError(
      {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Permission denied.',
      },
      'req_forbidden',
    );

    expect(mapped.statusCode).toBe(403);
    expect(mapped.body.error.code).toBe('FORBIDDEN');
  });
});

describe('readiness evaluation (unit)', () => {
  it('is ready when every check passes', async () => {
    const result = await evaluateReadiness([
      { id: 'config', check: () => ({ status: 'ok' }) },
      { id: 'extra', check: async () => ({ status: 'ok' }) },
    ]);

    expect(result.status).toBe('ok');
    expect(result.checks.map((check) => check.id)).toEqual(['config', 'extra']);
  });

  it('returns the first short reason and sanitizes unsafe check reasons', async () => {
    const result = await evaluateReadiness([
      { id: 'one', check: () => ({ status: 'ok' }) },
      { id: 'two', check: () => ({ status: 'error', reason: 'DATABASE_URL=secret' }) },
      { id: 'three', check: () => ({ status: 'error', reason: 'MIGRATIONS_PENDING' }) },
    ]);

    expect(result.status).toBe('error');
    expect(result.reason).toBe('HEALTH_CHECK_FAILED');
    expect(result.checks[1]?.reason).toBe('HEALTH_CHECK_FAILED');
  });

  it('turns a throwing check into a safe failure', async () => {
    const result = await evaluateReadiness([
      {
        id: 'broken',
        check: () => {
          throw new Error('connection string with password');
        },
      },
    ]);

    expect(result).toMatchObject({ status: 'error', reason: 'HEALTH_CHECK_FAILED' });
    expect(JSON.stringify(result)).not.toContain('password');
  });
});

describe('public config (unit)', () => {
  it('exposes only the frontend allowlist', async () => {
    const appConfig = await makeAppConfig({ appName: 'Fixture App' });
    const config = buildPublicConfig(appConfig, fixtureReport());

    expect(config).toEqual({
      appName: 'Fixture App',
      apiBaseUrl: '/v1',
      authMode: 'session',
      publicModules: ['fixture'],
    });
    expect(JSON.stringify(config)).not.toContain('postgres');
    expect(JSON.stringify(config)).not.toContain('version');
  });
});

describe('startup validation (unit)', () => {
  it('rejects wildcard CORS origins even without credentials', async () => {
    const appConfig = await makeAppConfig();
    const wildcardConfig = {
      ...appConfig,
      security: {
        ...appConfig.security,
        cors: { ...appConfig.security.cors, origins: ['*'], credentials: false },
      },
    } as AppConfig;

    expect(() => resolveApiServerOptions({ appConfig: wildcardConfig })).toThrow(
      ApiConfigurationError,
    );
    try {
      resolveApiServerOptions({ appConfig: wildcardConfig });
    } catch (error) {
      expect((error as ApiConfigurationError).code).toBe('CORS_WILDCARD_ORIGIN');
      expect((error as Error).message).not.toContain(VALID_DATABASE_URL);
    }
  });

  it('rejects a route whose permission is not in the activation report', async () => {
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

    expect(() =>
      resolveApiServerOptions({
        appConfig,
        activationReport: brokenReport,
        routeHandlers: fixtureHandlers('fixture:read'),
      }),
    ).toThrow(/unknown permission/);
  });

  it('rejects a declared route without a handler', async () => {
    const appConfig = await makeAppConfig();

    expect(() => resolveApiServerOptions({ appConfig, activationReport: fixtureReport() })).toThrow(
      /no registered handler/,
    );
  });

  it('rejects readiness checks that collide with core ids', async () => {
    const appConfig = await makeAppConfig();

    expect(() =>
      resolveApiServerOptions({
        appConfig,
        migrationCheck: { id: 'database', check: () => ({ status: 'ok' }) },
      }),
    ).toThrow(/reserved by core/);
  });

  it('returns independent empty reports', () => {
    const first = emptyActivationReport();
    const modified = { ...first, order: ['fixture'] };
    expect(modified.order).toEqual(['fixture']);
    expect(emptyActivationReport().order).toEqual([]);
  });

  it('uses the injected database health result for readiness checks', async () => {
    const appConfig = await makeAppConfig();
    const options = resolveApiServerOptions({
      appConfig,
      database: fakeDatabase({ status: 'error', reason: 'DATABASE_UNAVAILABLE' }),
    });

    const { buildReadinessChecks } = await import('../../src/api/index.js');
    const result = await evaluateReadiness(buildReadinessChecks(options));
    expect(result).toMatchObject({ status: 'error', reason: 'DATABASE_UNAVAILABLE' });
  });
});
