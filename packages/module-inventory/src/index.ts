import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  type ApiRouteDefinition,
  HttpError,
  successEnvelopeSchema,
} from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import type { ModuleDefinition } from '@skeletonstructure/core/modules';
import {
  type CatalogApi,
  INVENTORY_PORT,
  type InventoryPort,
} from '@skeletonstructure/module-catalog';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createInventoryService } from './service.js';
import type { InventoryApi, InventoryConfig } from './types.js';

export { inventoryItems } from './schema.js';
export { createInventoryService, INVENTORY_PORT } from './service.js';
export type { InventoryApi, InventoryConfig, InventoryItem } from './types.js';

export const inventoryModuleConfigSchema = z.object({
  allowNegativeStock: z.boolean().default(false),
});

export const INVENTORY_PERMISSIONS = [
  { key: 'inventory:read', description: 'Read inventory levels.' },
  { key: 'inventory:write', description: 'Set inventory levels.' },
] as const;

const inventoryDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId', 'quantity', 'reserved', 'createdAt', 'updatedAt'],
  properties: {
    itemId: { type: 'string' },
    quantity: { type: 'integer' },
    reserved: { type: 'integer', minimum: 0 },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

interface InventoryRequest {
  readonly params?: { readonly itemId?: string };
  readonly body?: unknown;
}

export interface InventoryModuleOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly catalog: CatalogApi;
}

export interface InventoryModule {
  readonly definition: ModuleDefinition<InventoryConfig>;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly api: InventoryApi & InventoryPort;
}

function itemId(request: InventoryRequest): string {
  const value = request.params?.itemId;
  if (value === undefined || value.length === 0) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  return value;
}

/** Builds the optional `inventory` module keyed by catalog item ID. */
export function createInventoryModule(options: InventoryModuleOptions): InventoryModule {
  const api = createInventoryService({
    database: options.database,
    catalog: options.catalog,
    allowNegativeStock: options.appConfig.modules.inventory.allowNegativeStock,
  });

  const routeHandlers: readonly ApiRouteDefinition[] = [
    {
      moduleId: 'inventory',
      method: 'GET',
      path: '/inventory/items/:itemId',
      permission: 'inventory:read',
      schema: successEnvelopeSchema(inventoryDataSchema),
      handler: async (request: FastifyRequest) => api.get(itemId(request as InventoryRequest)),
    },
    {
      moduleId: 'inventory',
      method: 'PATCH',
      path: '/inventory/items/:itemId',
      permission: 'inventory:write',
      schema: {
        ...successEnvelopeSchema(inventoryDataSchema),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['quantity'],
          properties: { quantity: { type: 'integer' } },
        },
      },
      handler: async (request: FastifyRequest) => {
        const inventoryRequest = request as InventoryRequest;
        const body = inventoryRequest.body as { readonly quantity?: unknown } | undefined;
        const quantity = typeof body?.quantity === 'number' ? body.quantity : Number.NaN;
        return api.set(itemId(inventoryRequest), quantity);
      },
    },
  ];

  const definition: ModuleDefinition<InventoryConfig> = {
    id: 'inventory',
    version: 1,
    stability: 'experimental',
    requires: ['catalog'],
    provides: [INVENTORY_PORT],
    configSchema: inventoryModuleConfigSchema,
    permissions: [...INVENTORY_PERMISSIONS],
    register(context) {
      for (const route of routeHandlers) {
        context.http.register({
          method: route.method,
          path: route.path,
          ...(route.permission === undefined ? {} : { permission: route.permission }),
        });
      }
    },
    publicApi: api,
  };

  return { definition, routeHandlers, api };
}

const SOURCE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations/', import.meta.url));
const BUILT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations/', import.meta.url));

export function inventoryMigrationsFolder(): string {
  return existsSync(SOURCE_MIGRATIONS_FOLDER) ? SOURCE_MIGRATIONS_FOLDER : BUILT_MIGRATIONS_FOLDER;
}

export async function runInventoryMigrations(database: Database) {
  return database.migrate({ migrationsFolder: inventoryMigrationsFolder() });
}
