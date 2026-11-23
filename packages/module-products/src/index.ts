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
  type CatalogExpansionProvider,
  PRICE_RESOLVER_PORT,
} from '@skeletonstructure/module-catalog';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createProductExpansionProvider, createProductsService } from './service.js';
import type { ProductConfig, ProductsApi, UpdateProductInput } from './types.js';

export { commerceProducts } from './schema.js';
export {
  createProductExpansionProvider,
  createProductsService,
  PRODUCT_DETAILS_SCHEMA_VERSION,
  PRODUCT_EXTENSION_KIND,
} from './service.js';
export type {
  CreateProductInput,
  ProductConfig,
  ProductDetails,
  ProductsApi,
  UpdateProductInput,
} from './types.js';

export const productsModuleConfigSchema = z.object({
  defaultCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
});

export const PRODUCTS_PERMISSIONS = [
  { key: 'products:write', description: 'Create or update product extension details.' },
] as const;

const productDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId', 'sku', 'priceAmount', 'currency', 'createdAt', 'updatedAt'],
  properties: {
    itemId: { type: 'string' },
    sku: { type: 'string' },
    priceAmount: { type: 'integer', minimum: 0 },
    currency: { type: 'string' },
    weightGrams: { type: 'integer', minimum: 0 },
    shippingClass: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const writeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sku', 'priceAmount'],
  properties: {
    sku: { type: 'string', minLength: 2, maxLength: 64 },
    priceAmount: { type: 'integer', minimum: 0 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    weightGrams: { type: 'integer', minimum: 0 },
    shippingClass: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

interface ProductRequest {
  readonly params?: { readonly id?: string };
  readonly body?: unknown;
}

export interface ProductsModuleOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly catalog: CatalogApi;
}

export interface ProductsModule {
  readonly definition: ModuleDefinition<ProductConfig>;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly api: ProductsApi;
  readonly expansionProvider: CatalogExpansionProvider;
}

function bodyOf(request: ProductRequest): Record<string, unknown> {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  return request.body as Record<string, unknown>;
}

function itemId(request: ProductRequest): string {
  const value = request.params?.id;
  if (value === undefined || value.length === 0) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  return value;
}

function readInput(body: Record<string, unknown>): UpdateProductInput {
  return {
    sku: typeof body.sku === 'string' ? body.sku : '',
    priceAmount: typeof body.priceAmount === 'number' ? body.priceAmount : -1,
    ...(typeof body.currency === 'string' ? { currency: body.currency } : {}),
    ...(typeof body.weightGrams === 'number' ? { weightGrams: body.weightGrams } : {}),
    ...(typeof body.shippingClass === 'string' ? { shippingClass: body.shippingClass } : {}),
  };
}

/** Builds the e-commerce catalog extension. It depends only on catalog's public API. */
export function createProductsModule(options: ProductsModuleOptions): ProductsModule {
  const api = createProductsService({
    database: options.database,
    catalog: options.catalog,
    defaultCurrency: options.appConfig.modules.products.defaultCurrency,
  });
  const expansionProvider = createProductExpansionProvider(api);
  const readPermission = options.appConfig.modules.catalog.publicRead ? undefined : 'catalog:read';

  const routeHandlers: readonly ApiRouteDefinition[] = [
    {
      moduleId: 'products',
      method: 'GET',
      path: '/catalog/items/:id/product',
      ...(readPermission === undefined ? {} : { permission: readPermission }),
      schema: successEnvelopeSchema(productDataSchema),
      handler: async (request: FastifyRequest) =>
        api.getByItemId(itemId(request as ProductRequest)),
    },
    {
      moduleId: 'products',
      method: 'PATCH',
      path: '/catalog/items/:id/product',
      permission: 'products:write',
      schema: {
        ...successEnvelopeSchema(productDataSchema),
        body: writeBodySchema,
      },
      handler: async (request: FastifyRequest) => {
        const productRequest = request as ProductRequest;
        return api.upsert(itemId(productRequest), readInput(bodyOf(productRequest)));
      },
    },
  ];

  const definition: ModuleDefinition<ProductConfig> = {
    id: 'products',
    version: 1,
    stability: 'experimental',
    requires: ['catalog'],
    provides: [PRICE_RESOLVER_PORT],
    configSchema: productsModuleConfigSchema,
    permissions: [...PRODUCTS_PERMISSIONS],
    register(context) {
      context.http.register({
        method: 'GET',
        path: '/catalog/items/:id/product',
        ...(context.appConfig.modules.catalog.publicRead ? {} : { permission: 'catalog:read' }),
      });
      context.http.register({
        method: 'PATCH',
        path: '/catalog/items/:id/product',
        permission: 'products:write',
      });
    },
    publicApi: api,
  };

  return { definition, routeHandlers, api, expansionProvider };
}

const SOURCE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations/', import.meta.url));
const BUILT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations/', import.meta.url));

export function productsMigrationsFolder(): string {
  return existsSync(SOURCE_MIGRATIONS_FOLDER) ? SOURCE_MIGRATIONS_FOLDER : BUILT_MIGRATIONS_FOLDER;
}

export async function runProductsMigrations(database: Database) {
  return database.migrate({ migrationsFolder: productsMigrationsFolder() });
}
