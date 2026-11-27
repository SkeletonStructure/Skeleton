import {
  createM8Composition,
  type M8Composition,
  runM8Migrations,
} from '@skeletonstructure/app-composition';
import type { ApiRouteDefinition } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { AuditSink, Database } from '@skeletonstructure/core/database';
import type { ModuleConfigSource } from '@skeletonstructure/core/modules';

import {
  type CartModule,
  createCartModule,
  runCartMigrations,
} from '../../modules/cart/src/index.js';

export interface DemoEcommerceCompositionOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly audit?: AuditSink;
}

export interface DemoEcommerceComposition extends M8Composition {
  readonly cart: CartModule['api'];
  readonly cartModule: CartModule;
}

/**
 * App-local composition: the checked-in M8 wiring plus one demo-local cart
 * module. Shared packages are not modified to discover demo code.
 */
export async function createDemoEcommerceComposition(
  options: DemoEcommerceCompositionOptions,
): Promise<DemoEcommerceComposition> {
  const cart = createCartModule({ database: options.database });
  const moduleConfig: ModuleConfigSource = {
    ...(options.appConfig.modules as unknown as Record<string, unknown>),
    cart: { enabled: true },
  };

  const composition = await createM8Composition({
    appConfig: options.appConfig,
    database: options.database,
    ...(options.audit === undefined ? {} : { audit: options.audit }),
    moduleConfig,
    additionalModules: [cart.definition],
  });

  cart.bind({
    catalog: composition.catalog,
    products: composition.products,
    orders: composition.orders,
    buyerContext: composition.auth,
  });

  const declared = new Set(
    composition.activationReport.routes.map((route) => `${route.method} ${route.path}`),
  );
  const routeHandlers: readonly ApiRouteDefinition[] = [
    ...composition.routeHandlers,
    ...cart.routeHandlers,
  ].filter((route) => declared.has(`${route.method} ${route.path}`));

  return {
    ...composition,
    routeHandlers,
    cart: cart.api,
    cartModule: cart,
  };
}

/** Shared M8 migrations first, then the demo-local cart migration. */
export async function runDemoEcommerceMigrations(database: Database) {
  const shared = await runM8Migrations(database);
  const cart = await runCartMigrations(database);
  return { ...shared, cart };
}
