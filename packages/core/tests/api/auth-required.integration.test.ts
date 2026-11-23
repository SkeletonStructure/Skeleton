import { describe, expect, it } from 'vitest';
import type { ActivationReport } from '../../src/modules/index.js';

import { makeAppConfig, withServer } from './helpers.js';

const report: ActivationReport = {
  enabled: [],
  disabled: [],
  order: [],
  permissions: [],
  routes: [{ moduleId: 'fixture', method: 'GET', path: '/private' }],
  ports: [],
};

describe('authentication-only routes (integration)', () => {
  it('requires a principal even without a permission key', async () => {
    const appConfig = await makeAppConfig();
    const routeHandlers = [
      {
        moduleId: 'fixture',
        method: 'GET' as const,
        path: '/private',
        requireAuth: true,
        handler: async (request: { principal?: { id: string } }) => ({ id: request.principal?.id }),
      },
    ];

    await withServer({ appConfig, activationReport: report, routeHandlers }, async (app) => {
      const anonymous = await app.inject({ method: 'GET', url: '/v1/private' });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json().error.code).toBe('UNAUTHENTICATED');
    });

    await withServer(
      {
        appConfig,
        activationReport: report,
        routeHandlers,
        authenticator: {
          authenticate: async () => ({ id: 'user_1', permissions: [] }),
        },
      },
      async (app) => {
        const authenticated = await app.inject({ method: 'GET', url: '/v1/private' });
        expect(authenticated.statusCode).toBe(200);
        expect(authenticated.json().data).toEqual({ id: 'user_1' });
      },
    );
  });
});
