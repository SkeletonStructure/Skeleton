import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  type ApiRouteDefinition,
  HttpError,
  pageResult,
  successEnvelopeSchema,
  validationError,
} from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import type { ModuleDefinition } from '@skeletonstructure/core/modules';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createCatalogService } from './service.js';
import type {
  CatalogApi,
  CatalogConfig,
  CatalogExpansionProvider,
  CatalogItem,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from './types.js';
import { parseLimit } from './util.js';

export type {
  InventoryPort,
  ItemSnapshot,
  Money,
  PriceContext,
  PriceResolverPort,
  StockReservationItem,
} from './ports.js';
export { INVENTORY_PORT, PRICE_RESOLVER_PORT } from './ports.js';
export { catalogItems } from './schema.js';
export { createCatalogService } from './service.js';
export type {
  CatalogApi,
  CatalogConfig,
  CatalogExpansionProvider,
  CatalogItem,
  CatalogItemId,
  CatalogItemPage,
  CatalogItemStatus,
  CreateCatalogItemInput,
  ListCatalogItemsInput,
  UpdateCatalogItemInput,
} from './types.js';
export {
  decodeCursor,
  encodeCursor,
  isUniqueViolation,
  newPrefixedId,
  parseLimit,
} from './util.js';

export const catalogModuleConfigSchema = z.object({
  publicRead: z.boolean().default(false),
});

export const CATALOG_PERMISSIONS = [
  { key: 'catalog:read', description: 'Read catalog items.' },
  { key: 'catalog:write', description: 'Create, update, and archive catalog items.' },
] as const;

const catalogItemDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'slug', 'name', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: ['active', 'archived'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    details: { type: 'object', additionalProperties: true },
  },
} as const;

const listDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: { type: 'array', items: catalogItemDataSchema },
  },
} as const;

const writeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'name'],
  properties: {
    slug: { type: 'string', minLength: 1, maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 0, maxLength: 2000 },
  },
} as const;

const updateBodySchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 3,
  properties: {
    slug: { type: 'string', minLength: 1, maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', minLength: 0, maxLength: 2000, nullable: true },
  },
} as const;

interface CatalogRequest {
  readonly params?: { readonly id?: string };
  readonly query?: Record<string, unknown>;
  readonly body?: unknown;
}

export interface CatalogModuleOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly expansionProviders?: readonly CatalogExpansionProvider[];
}

export interface CatalogModule {
  readonly definition: ModuleDefinition<CatalogConfig>;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly api: CatalogApi;
}

function bodyOf(request: CatalogRequest): Record<string, unknown> {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  return request.body as Record<string, unknown>;
}

function readCreateInput(body: Record<string, unknown>): CreateCatalogItemInput {
  return {
    slug: typeof body.slug === 'string' ? body.slug : '',
    name: typeof body.name === 'string' ? body.name : '',
    ...(typeof body.description === 'string' ? { description: body.description } : {}),
  };
}

function readUpdateInput(body: Record<string, unknown>): UpdateCatalogItemInput {
  return {
    ...(typeof body.slug === 'string' ? { slug: body.slug } : {}),
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(body.description === null || typeof body.description === 'string'
      ? { description: body.description }
      : {}),
  };
}

/** Builds the optional `catalog` module without importing catalog extensions. */
export function createCatalogModule(options: CatalogModuleOptions): CatalogModule {
  const api = createCatalogService(options.database);
  const publicRead = options.appConfig.modules.catalog.publicRead;
  const readPermission = publicRead ? undefined : 'catalog:read';
  const providers = new Map(
    (options.expansionProviders ?? []).map((provider) => [provider.kind, provider]),
  );
  const allowedExpansions = [...providers.keys()].sort();
  const expansionDescription = `Allowed values: ${allowedExpansions.join(', ') || 'none'}.`;
  const listQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'string', pattern: '^\\d+$' },
      cursor: { type: 'string', minLength: 1 },
      status: { type: 'string', enum: ['active', 'archived'] },
      expand: { type: 'string', minLength: 1, description: expansionDescription },
    },
  } as const;
  const itemQuerySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      expand: { type: 'string', minLength: 1, description: expansionDescription },
    },
  } as const;

  function requestedExpansion(request: CatalogRequest): string | undefined {
    const value = request.query?.expand;
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length === 0 || Array.isArray(value)) {
      throw validationError([
        {
          path: 'query.expand',
          message: `Unknown expansion. Allowed values: ${allowedExpansions.join(', ') || 'none'}.`,
        },
      ]);
    }
    if (!providers.has(value)) {
      throw validationError([
        {
          path: 'query.expand',
          message: `Unknown expansion. Allowed values: ${allowedExpansions.join(', ') || 'none'}.`,
        },
      ]);
    }
    return value;
  }

  async function expand(item: CatalogItem, kind: string | undefined): Promise<CatalogItem> {
    if (kind === undefined) return item;
    const provider = providers.get(kind);
    if (provider === undefined) {
      throw validationError([
        {
          path: 'query.expand',
          message: `Unknown expansion. Allowed values: ${allowedExpansions.join(', ') || 'none'}.`,
        },
      ]);
    }
    const details = await provider.load(item.id);
    return {
      ...item,
      ...(details === undefined ? {} : { details: { [kind]: details } }),
    };
  }

  function itemId(request: CatalogRequest): string {
    const id = request.params?.id;
    if (id === undefined || id.length === 0) {
      throw validationError([{ path: 'params.id', message: 'Catalog item ID is required.' }]);
    }
    return id;
  }

  const routeHandlers: readonly ApiRouteDefinition[] = [
    {
      moduleId: 'catalog',
      method: 'GET',
      path: '/catalog/items',
      ...(readPermission === undefined ? {} : { permission: readPermission }),
      schema: {
        ...successEnvelopeSchema(listDataSchema),
        querystring: listQuerySchema,
      },
      handler: async (request: FastifyRequest) => {
        const catalogRequest = request as CatalogRequest;
        const expandKind = requestedExpansion(catalogRequest);
        const statusValue = catalogRequest.query?.status;
        const status =
          statusValue === 'active' || statusValue === 'archived' ? statusValue : undefined;
        const result = await api.list({
          limit: parseLimit(catalogRequest.query?.limit),
          ...(catalogRequest.query?.cursor === undefined
            ? {}
            : { cursor: String(catalogRequest.query.cursor) }),
          ...(status === undefined ? {} : { status }),
        });
        const items = await Promise.all(result.items.map((item) => expand(item, expandKind)));
        return pageResult({ items }, result.nextCursor);
      },
    },
    {
      moduleId: 'catalog',
      method: 'GET',
      path: '/catalog/items/:id',
      ...(readPermission === undefined ? {} : { permission: readPermission }),
      schema: {
        ...successEnvelopeSchema(catalogItemDataSchema),
        querystring: itemQuerySchema,
      },
      handler: async (request: FastifyRequest) => {
        const catalogRequest = request as CatalogRequest;
        const expandKind = requestedExpansion(catalogRequest);
        return expand(await api.getById(itemId(catalogRequest)), expandKind);
      },
    },
    {
      moduleId: 'catalog',
      method: 'POST',
      path: '/catalog/items',
      permission: 'catalog:write',
      schema: {
        ...successEnvelopeSchema(catalogItemDataSchema),
        body: writeBodySchema,
      },
      handler: async (request: FastifyRequest) =>
        api.create(readCreateInput(bodyOf(request as CatalogRequest))),
    },
    {
      moduleId: 'catalog',
      method: 'PATCH',
      path: '/catalog/items/:id',
      permission: 'catalog:write',
      schema: {
        ...successEnvelopeSchema(catalogItemDataSchema),
        body: updateBodySchema,
      },
      handler: async (request: FastifyRequest) => {
        const catalogRequest = request as CatalogRequest;
        return api.update(itemId(catalogRequest), readUpdateInput(bodyOf(catalogRequest)));
      },
    },
    {
      moduleId: 'catalog',
      method: 'DELETE',
      path: '/catalog/items/:id',
      permission: 'catalog:write',
      schema: successEnvelopeSchema(catalogItemDataSchema),
      handler: async (request: FastifyRequest) => api.archive(itemId(request as CatalogRequest)),
    },
  ];

  const definition: ModuleDefinition<CatalogConfig> = {
    id: 'catalog',
    version: 1,
    stability: 'experimental',
    configSchema: catalogModuleConfigSchema,
    permissions: [...CATALOG_PERMISSIONS],
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

export function catalogMigrationsFolder(): string {
  return existsSync(SOURCE_MIGRATIONS_FOLDER) ? SOURCE_MIGRATIONS_FOLDER : BUILT_MIGRATIONS_FOLDER;
}

export async function runCatalogMigrations(database: Database) {
  return database.migrate({ migrationsFolder: catalogMigrationsFolder() });
}
