import type { ApiRouteDefinition, Authenticator, CsrfGuard } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import {
  type AuditSink,
  type Database,
  defaultMigrationsFolder,
} from '@skeletonstructure/core/database';
import {
  type ActivationReport,
  composeModuleRegistry,
  type ModuleConfigSource,
  type ModuleDefinition,
} from '@skeletonstructure/core/modules';
import {
  BUYER_CONTEXT_PORT as AUTH_BUYER_CONTEXT_PORT,
  authMigrationsFolder,
  createAuthModule,
  createAuthUsersComposition,
  type EmailProvider,
  runAuthUsersMigrations,
} from '@skeletonstructure/module-auth';
import {
  catalogMigrationsFolder,
  createCatalogModule,
  createCatalogService,
  PRICE_RESOLVER_PORT,
  runCatalogMigrations,
} from '@skeletonstructure/module-catalog';
import {
  createInventoryModule,
  INVENTORY_PORT,
  inventoryMigrationsFolder,
  runInventoryMigrations,
} from '@skeletonstructure/module-inventory';
import {
  createOrdersModule,
  BUYER_CONTEXT_PORT as ORDERS_BUYER_CONTEXT_PORT,
  ordersMigrationsFolder,
  runOrdersMigrations,
} from '@skeletonstructure/module-orders';
import {
  createProductsModule,
  productsMigrationsFolder,
  runProductsMigrations,
} from '@skeletonstructure/module-products';
import { createUsersModule, usersMigrationsFolder } from '@skeletonstructure/module-users';

export const AMBIGUOUS_PRICE_RESOLVER = 'AMBIGUOUS_PRICE_RESOLVER' as const;

export type CompositionErrorCode = typeof AMBIGUOUS_PRICE_RESOLVER;

export class CompositionError extends Error {
  readonly code: CompositionErrorCode;

  constructor(code: CompositionErrorCode, message: string) {
    super(message);
    this.name = 'CompositionError';
    this.code = code;
  }
}

function providesPort(
  definition: ModuleDefinition,
  port: { id: string; version: number },
): boolean {
  return (
    definition.provides?.some(
      (candidate) => candidate.id === port.id && candidate.version === port.version,
    ) ?? false
  );
}

/** Fails before server startup when more than one active price resolver exists. */
export function assertSinglePriceResolver(
  definitions: readonly ModuleDefinition[],
  enabledIds: readonly string[],
  appName: string,
): void {
  const enabled = new Set(enabledIds);
  const providers = definitions
    .filter(
      (definition) => enabled.has(definition.id) && providesPort(definition, PRICE_RESOLVER_PORT),
    )
    .map((definition) => definition.id);
  if (providers.length > 1) {
    throw new CompositionError(
      AMBIGUOUS_PRICE_RESOLVER,
      `Application "${appName}" has multiple enabled price resolvers: ${providers.join(', ')}.`,
    );
  }
}

function enabledIdsFor(options: M8CompositionOptions): readonly string[] {
  const ids = [
    ...new Set([
      'users',
      'auth',
      'catalog',
      'products',
      'inventory',
      'orders',
      ...(options.additionalModules?.map((definition) => definition.id) ?? []),
    ]),
  ];
  const overrides = options.moduleConfig ?? {};
  return ids.filter((id) => {
    const override = overrides[id];
    if (typeof override === 'object' && override !== null && 'enabled' in override) {
      return (override as { enabled?: unknown }).enabled === true;
    }
    return (
      (options.appConfig.modules as Record<string, { enabled?: unknown }>)[id]?.enabled === true
    );
  });
}

export interface M8CompositionOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly emailProvider?: EmailProvider;
  readonly audit?: AuditSink;
  readonly moduleConfig?: ModuleConfigSource;
  /**
   * Application-owned modules registered alongside M8. This is not a plugin
   * discovery seam; it exists so applications can declare their own providers
   * and have ambiguity detected by the static composition boundary.
   */
  readonly additionalModules?: readonly ModuleDefinition[];
}

export interface M8Composition {
  readonly registry: ReturnType<typeof composeModuleRegistry>;
  readonly activationReport: ActivationReport;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly authenticator: Authenticator;
  readonly csrfGuard: CsrfGuard;
  readonly audit: AuditSink | undefined;
  readonly auth: ReturnType<typeof createAuthModule>['api'];
  readonly users: ReturnType<typeof createUsersModule>['api'];
  readonly catalog: ReturnType<typeof createCatalogModule>['api'];
  readonly products: ReturnType<typeof createProductsModule>['api'];
  readonly inventory: ReturnType<typeof createInventoryModule>['api'];
  readonly orders: ReturnType<typeof createOrdersModule>['api'];
}

/**
 * Static M8 composition. It is application wiring, not a module: core and the
 * business modules remain unaware of each other's concrete implementations.
 */
export async function createM8Composition(options: M8CompositionOptions): Promise<M8Composition> {
  const enabledIds = enabledIdsFor(options);
  const usersModule = createUsersModule({
    appConfig: options.appConfig,
    database: options.database,
    ...(options.audit === undefined ? {} : { audit: options.audit }),
  });
  const authModule = createAuthModule({
    appConfig: options.appConfig,
    database: options.database,
    users: usersModule.api,
    ...(options.emailProvider === undefined ? {} : { emailProvider: options.emailProvider }),
    ...(options.audit === undefined ? {} : { audit: options.audit }),
  });
  const standaloneCatalog = createCatalogService(options.database);
  const productsModule = createProductsModule({
    appConfig: options.appConfig,
    database: options.database,
    catalog: standaloneCatalog,
  });
  const catalogModule = createCatalogModule({
    appConfig: options.appConfig,
    database: options.database,
    ...(enabledIds.includes('products')
      ? { expansionProviders: [productsModule.expansionProvider] }
      : {}),
  });
  const inventoryModule = createInventoryModule({
    appConfig: options.appConfig,
    database: options.database,
    catalog: catalogModule.api,
  });
  const ordersModule = createOrdersModule({
    appConfig: options.appConfig,
    database: options.database,
    buyerContext: authModule.api,
  });

  const definitions: readonly ModuleDefinition[] = [
    usersModule.definition,
    authModule.definition,
    catalogModule.definition,
    productsModule.definition,
    inventoryModule.definition,
    ordersModule.definition,
    ...(options.additionalModules ?? []),
  ];

  assertSinglePriceResolver(definitions, enabledIds, options.appConfig.app.name);

  const registry = composeModuleRegistry({
    appConfig: options.appConfig,
    database: options.database,
    modules: [...definitions],
  });
  const activationReport = await registry.activate(
    options.moduleConfig === undefined ? {} : { moduleConfig: options.moduleConfig },
  );

  const priceBinding = activationReport.ports.find(
    (port) => port.id === PRICE_RESOLVER_PORT.id && port.version === PRICE_RESOLVER_PORT.version,
  );
  const inventoryBinding = activationReport.ports.find(
    (port) => port.id === INVENTORY_PORT.id && port.version === INVENTORY_PORT.version,
  );
  const buyerBinding = activationReport.ports.find(
    (port) =>
      port.id === AUTH_BUYER_CONTEXT_PORT.id && port.version === ORDERS_BUYER_CONTEXT_PORT.version,
  );
  if (enabledIds.includes('orders') && buyerBinding === undefined) {
    throw new Error('BuyerContextPort was not resolved for enabled orders.');
  }

  // Orders is built before activation because its definition carries the port
  // requirements. Rebuild it with the resolved provider APIs.
  const composedOrders = createOrdersModule({
    appConfig: options.appConfig,
    database: options.database,
    buyerContext: authModule.api,
    ...(priceBinding === undefined ? {} : { priceResolver: productsModule.api }),
    ...(inventoryBinding === undefined ? {} : { inventory: inventoryModule.api }),
  });

  const declared = new Set(activationReport.routes.map((route) => `${route.method} ${route.path}`));
  const routeHandlers = [
    ...usersModule.routeHandlers,
    ...authModule.routeHandlers,
    ...catalogModule.routeHandlers,
    ...productsModule.routeHandlers,
    ...inventoryModule.routeHandlers,
    ...composedOrders.routeHandlers,
  ].filter((route) => declared.has(`${route.method} ${route.path}`));

  return {
    registry,
    activationReport,
    routeHandlers,
    authenticator: authModule.api.authenticator,
    csrfGuard: authModule.api.csrfGuard,
    audit: options.audit,
    auth: authModule.api,
    users: usersModule.api,
    catalog: catalogModule.api,
    products: productsModule.api,
    inventory: inventoryModule.api,
    orders: composedOrders.api,
  };
}

/** Explicit migration folders for the shared M1-M8 graph, in migration order. */
export function m8MigrationFolders(): readonly string[] {
  return [
    defaultMigrationsFolder(),
    usersMigrationsFolder(),
    authMigrationsFolder(),
    catalogMigrationsFolder(),
    productsMigrationsFolder(),
    inventoryMigrationsFolder(),
    ordersMigrationsFolder(),
  ];
}

/** Applies all M1-M8 migrations in explicit dependency order. */
export async function runM8Migrations(database: Database) {
  const authUsers = await runAuthUsersMigrations(database);
  const catalog = await runCatalogMigrations(database);
  const products = await runProductsMigrations(database);
  const inventory = await runInventoryMigrations(database);
  const orders = await runOrdersMigrations(database);
  return { ...authUsers, catalog, products, inventory, orders };
}

export * from './runtime.js';
export { createAuthUsersComposition };
