import { type AppConfig, defineConfig, env, loadConfig } from '@skeletonstructure/core/config';
import {
  closeDatabase,
  type Database,
  getDatabase,
  initializeDatabase,
} from '@skeletonstructure/core/database';

export interface M8TestConfigOverrides {
  readonly appName?: string;
  readonly enabled?: Partial<
    Record<'auth' | 'users' | 'catalog' | 'products' | 'inventory' | 'orders', boolean>
  >;
  readonly publicRead?: boolean;
  readonly defaultCurrency?: string;
  readonly allowNegativeStock?: boolean;
  readonly requireIdempotencyKey?: boolean;
}

export async function makeM8Config(
  databaseUrl: string,
  overrides: M8TestConfigOverrides = {},
): Promise<AppConfig> {
  const enabled = overrides.enabled ?? {};
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: databaseUrl, DB_POOL_MAX: '10' },
    config: () =>
      defineConfig({
        app: { name: overrides.appName ?? 'M8 Test' },
        database: { url: env('DATABASE_URL') },
        security: { rateLimit: { enabled: false, max: 1000, windowMs: 60_000 } },
        modules: {
          auth: { enabled: enabled.auth ?? false, passwordMinLength: 12 },
          users: { enabled: enabled.users ?? false, allowSelfUpdate: true },
          catalog: {
            enabled: enabled.catalog ?? false,
            publicRead: overrides.publicRead ?? false,
          },
          products: {
            enabled: enabled.products ?? false,
            defaultCurrency: overrides.defaultCurrency ?? 'USD',
          },
          inventory: {
            enabled: enabled.inventory ?? false,
            allowNegativeStock: overrides.allowNegativeStock ?? false,
          },
          orders: {
            enabled: enabled.orders ?? false,
            requireIdempotencyKey: overrides.requireIdempotencyKey ?? true,
          },
        },
      }),
  });
}

export async function initializeTestDatabase(databaseUrl: string): Promise<Database> {
  const appConfig = await makeM8Config(databaseUrl);
  return initializeDatabase(appConfig.database);
}

export async function closeTestDatabase(database: Database): Promise<void> {
  await database.close();
  await closeDatabase();
}

export { getDatabase };
