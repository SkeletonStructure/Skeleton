import type { FastifyInstance } from 'fastify';

import {
  type ApiRouteDefinition,
  type ApiServerOptions,
  createServer,
} from '../../src/api/index.js';
import { type AppConfig, defineConfig, env, loadConfig } from '../../src/config/index.js';
import type { Database, DatabaseHealthResult } from '../../src/database/index.js';
import type { ActivationReport, ModuleSummary } from '../../src/modules/index.js';

export const VALID_DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';

export interface AppConfigOverrides {
  readonly appName?: string;
  readonly origins?: readonly string[];
  readonly credentials?: boolean;
  readonly rateLimitEnabled?: boolean;
  readonly rateLimitMax?: number;
  readonly rateLimitWindowMs?: number;
}

export async function makeAppConfig(overrides: AppConfigOverrides = {}): Promise<AppConfig> {
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: VALID_DATABASE_URL },
    config: () =>
      defineConfig({
        app: { name: overrides.appName ?? 'Fixture App' },
        security: {
          cors: {
            origins: [...(overrides.origins ?? [])],
            credentials: overrides.credentials ?? true,
          },
          rateLimit: {
            enabled: overrides.rateLimitEnabled ?? true,
            max: overrides.rateLimitMax ?? 100,
            windowMs: overrides.rateLimitWindowMs ?? 60_000,
          },
        },
        database: { url: env('DATABASE_URL') },
      }),
  });
}

export function fakeDatabase(health: DatabaseHealthResult = { status: 'ok' }): Database {
  return {
    db: {},
    transaction: async (fn: (tx: never) => Promise<unknown>) => fn({} as never),
    health: async () => health,
    migrate: async () => ({ appliedCount: 0, upToDate: true }),
    close: async () => undefined,
  } as unknown as Database;
}

export function fixtureSummary(id = 'fixture'): ModuleSummary {
  return {
    id,
    version: 1,
    stability: 'stable',
    requires: [],
    enhances: [],
    provides: [],
    consumes: [],
  };
}

export function fixtureReport(permission = 'fixture:read'): ActivationReport {
  return {
    enabled: [fixtureSummary()],
    disabled: [],
    order: ['fixture'],
    permissions: [{ key: permission, description: 'Fixture permission.' }],
    routes: [
      {
        moduleId: 'fixture',
        method: 'GET',
        path: '/fixture',
        permission,
      },
    ],
    ports: [],
  };
}

export function fixtureHandlers(permission = 'fixture:read'): readonly ApiRouteDefinition[] {
  return [
    {
      moduleId: 'fixture',
      method: 'GET',
      path: '/fixture',
      permission,
      handler: async () => ({ ok: true }),
    },
  ];
}

export async function withServer<T>(
  options: ApiServerOptions,
  run: (app: FastifyInstance) => Promise<T>,
): Promise<T> {
  const app = await createServer(options);
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}
