import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ApiRouteDefinition } from '@skeletonstructure/core/api';
import type { Database } from '@skeletonstructure/core/database';
import type { ModuleDefinition } from '@skeletonstructure/core/modules';
import { z } from 'zod';

import { createCartRoutes } from './routes.js';
import { type BoundCartService, createCartService } from './service.js';
import type { CartConfig, CartDependencies, DemoBuyerContextPort } from './types.js';

export { demoEcommerceCartItems, demoEcommerceCarts } from './schema.js';
export { createCartService } from './service.js';
export type {
  Cart,
  CartConfig,
  CartDependencies,
  CartLine,
  CartService,
  CheckoutResult,
  DemoBuyerContextPort,
} from './types.js';

/** Mirrors the shared buyer-context port without importing an application module. */
export const DEMO_BUYER_CONTEXT_PORT = { id: 'buyer-context', version: 1 } as const;

export const CART_PERMISSIONS = [
  { key: 'cart:read', description: 'Read the current buyer cart.' },
  { key: 'cart:write', description: 'Add or remove items from the current buyer cart.' },
  { key: 'cart:checkout', description: 'Check out the current buyer cart.' },
] as const;

export const cartConfigSchema = z.object({
  maxQuantity: z.number().int().min(1).max(99).default(99),
});

export interface CartModuleOptions {
  readonly database: Database;
  readonly maxQuantity?: number;
}

export interface CartModule {
  readonly definition: ModuleDefinition<CartConfig>;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly api: BoundCartService;
  readonly bind: (dependencies: CartDependencies) => void;
}

/** Demo-local cart module. It never lives in `packages/` and uses only public module APIs. */
export function createCartModule(options: CartModuleOptions): CartModule {
  const maxQuantity = options.maxQuantity ?? 99;
  const api = createCartService({ database: options.database, maxQuantity });
  let dependencies: CartDependencies | undefined;

  const bind = (next: CartDependencies): void => {
    dependencies = next;
    api.bind(next);
  };

  const buyerContext = (): DemoBuyerContextPort => {
    if (dependencies === undefined) {
      throw new Error('Cart dependencies were not bound before use.');
    }
    return dependencies.buyerContext;
  };

  const routeHandlers = createCartRoutes({ service: api, buyerContext });

  const definition: ModuleDefinition<CartConfig> = {
    id: 'cart',
    version: 1,
    stability: 'experimental',
    requires: ['catalog', 'products', 'orders'],
    consumes: [DEMO_BUYER_CONTEXT_PORT],
    configSchema: cartConfigSchema,
    permissions: [...CART_PERMISSIONS],
    register(context) {
      context.http.register({ method: 'GET', path: '/cart', permission: 'cart:read' });
      context.http.register({
        method: 'PUT',
        path: '/cart/items/:itemId',
        permission: 'cart:write',
      });
      context.http.register({
        method: 'DELETE',
        path: '/cart/items/:itemId',
        permission: 'cart:write',
      });
      context.http.register({
        method: 'POST',
        path: '/cart/checkout',
        permission: 'cart:checkout',
      });
    },
    publicApi: api,
  };

  return { definition, routeHandlers, api, bind };
}

const SOURCE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations/', import.meta.url));
const BUILT_MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../../modules/cart/migrations/', import.meta.url),
);

export function cartMigrationsFolder(): string {
  return existsSync(`${SOURCE_MIGRATIONS_FOLDER}meta/_journal.json`)
    ? SOURCE_MIGRATIONS_FOLDER
    : BUILT_MIGRATIONS_FOLDER;
}

export async function runCartMigrations(database: Database) {
  return database.migrate({ migrationsFolder: cartMigrationsFolder() });
}
