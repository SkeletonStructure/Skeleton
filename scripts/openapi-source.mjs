import { createM8Composition } from '@skeletonstructure/app-composition';
import { generateOpenApiDocument } from '@skeletonstructure/core/api';
import { defineConfig, env, loadConfig } from '@skeletonstructure/core/config';

/**
 * The committed artifact describes the public M8 contract. It does not need a
 * database connection; the URL below is a non-secret placeholder used to
 * satisfy the M2 schema. Module services are built lazily and never queried.
 */
export async function buildCommittedOpenApiDocument() {
  const appConfig = await loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: 'postgres://placeholder:placeholder@localhost:5432/placeholder' },
    config: () =>
      defineConfig({
        app: { name: 'SkeletonStructure' },
        database: { url: env('DATABASE_URL') },
        modules: {
          auth: { enabled: true, passwordMinLength: 12 },
          users: { enabled: true, allowSelfUpdate: true },
          catalog: { enabled: true, publicRead: false },
          products: { enabled: true, defaultCurrency: 'USD' },
          orders: { enabled: true, requireIdempotencyKey: true },
          inventory: { enabled: true, allowNegativeStock: false },
        },
      }),
  });

  const database = {
    db: {},
    transaction: async (fn) => fn({}),
    health: async () => ({ status: 'ok' }),
    migrate: async () => ({ appliedCount: 0, upToDate: true }),
    close: async () => undefined,
  };

  const composition = await createM8Composition({ appConfig, database });

  return generateOpenApiDocument({
    appConfig,
    activationReport: composition.activationReport,
    routeHandlers: composition.routeHandlers,
    authenticator: composition.authenticator,
    csrfGuard: composition.csrfGuard,
  });
}
