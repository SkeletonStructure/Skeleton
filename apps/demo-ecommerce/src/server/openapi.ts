import { generateOpenApiDocument } from '@skeletonstructure/core/api';
import { defineConfig, env, loadConfig } from '@skeletonstructure/core/config';

import { createDemoEcommerceComposition } from './composition.js';

/** Builds the demo-specific artifact from the real Fastify routes. */
export async function buildDemoEcommerceOpenApiDocument() {
  const appConfig = await loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: 'postgres://placeholder:placeholder@localhost:5432/placeholder' },
    config: () =>
      defineConfig({
        app: { name: 'SkeletonStructure E-commerce Demo' },
        database: { url: env('DATABASE_URL') },
        modules: {
          auth: { enabled: true, passwordMinLength: 12 },
          users: { enabled: true, allowSelfUpdate: true },
          catalog: { enabled: true, publicRead: true },
          products: { enabled: true, defaultCurrency: 'USD' },
          inventory: { enabled: true, allowNegativeStock: false },
          orders: { enabled: true, requireIdempotencyKey: true },
        },
      }),
  });

  const database = {
    db: {},
    transaction: async <T>(fn: (tx: never) => Promise<T>) => fn(undefined as never),
    health: async () => ({ status: 'ok' as const }),
    migrate: async () => ({ appliedCount: 0, upToDate: true }),
    close: async () => undefined,
  };

  const composition = await createDemoEcommerceComposition({
    appConfig,
    database: database as never,
  });

  return generateOpenApiDocument({
    appConfig,
    activationReport: composition.activationReport,
    routeHandlers: composition.routeHandlers,
    authenticator: composition.authenticator,
    csrfGuard: composition.csrfGuard,
  });
}
