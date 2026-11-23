import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  type ApiRouteDefinition,
  HttpError,
  pageResult,
  successEnvelopeSchema,
} from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import type { ModuleDefinition } from '@skeletonstructure/core/modules';
import {
  INVENTORY_PORT,
  type InventoryPort,
  PRICE_RESOLVER_PORT,
  type PriceResolverPort,
} from '@skeletonstructure/module-catalog';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createOrdersService, type OrdersService } from './service.js';
import {
  BUYER_CONTEXT_PORT,
  type BuyerContextPort,
  type CreateOrderInput,
  type OrdersConfig,
} from './types.js';

export { orderIdempotency, orderItems, orders } from './schema.js';
export type { OrdersService } from './service.js';
export { BUYER_CONTEXT_PORT, createOrdersService } from './service.js';
export type {
  BuyerContextPort,
  BuyerRef,
  CreateOrderContext,
  CreateOrderInput,
  CreateOrderLineInput,
  ListOrdersInput,
  Order,
  OrderLine,
  OrderStatus,
  OrdersConfig,
} from './types.js';

export const ordersModuleConfigSchema = z.object({
  requireIdempotencyKey: z.boolean().default(true),
});

export const ORDERS_PERMISSIONS = [
  { key: 'orders:create', description: 'Create orders.' },
  { key: 'orders:read', description: 'Read the current buyer’s orders.' },
  { key: 'orders:read:any', description: 'Read any buyer’s orders.' },
] as const;

const orderLineDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'itemId',
    'name',
    'quantity',
    'unitAmount',
    'currency',
    'extensionKind',
    'detailsSchemaVersion',
    'details',
  ],
  properties: {
    itemId: { type: 'string' },
    name: { type: 'string' },
    quantity: { type: 'integer' },
    unitAmount: { type: 'integer' },
    currency: { type: 'string' },
    extensionKind: { type: 'string' },
    detailsSchemaVersion: { type: 'integer' },
    details: { type: 'object', additionalProperties: true },
  },
} as const;

const orderDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status', 'buyer', 'items', 'totalAmount', 'currency', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['confirmed'] },
    buyer: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'id'],
      properties: {
        kind: { type: 'string', enum: ['user'] },
        id: { type: 'string' },
      },
    },
    items: { type: 'array', items: orderLineDataSchema },
    totalAmount: { type: 'integer' },
    currency: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

const listDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['orders'],
  properties: { orders: { type: 'array', items: orderDataSchema } },
} as const;

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'quantity'],
        properties: {
          itemId: { type: 'string', minLength: 1, maxLength: 200 },
          quantity: { type: 'integer', minimum: 1 },
          unitAmount: { type: 'integer', minimum: 0 },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
        },
      },
    },
  },
} as const;

const idempotencyHeadersSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'string', pattern: '^\\d+$' },
    cursor: { type: 'string', minLength: 1 },
  },
} as const;

interface OrderRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly principal?: { readonly id?: string; readonly permissions?: readonly string[] };
  readonly params?: { readonly id?: string };
  readonly query?: Record<string, unknown>;
  readonly body?: unknown;
}

export interface OrdersModuleOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly buyerContext: BuyerContextPort;
  readonly priceResolver?: PriceResolverPort;
  readonly inventory?: InventoryPort;
}

export interface OrdersModule {
  readonly definition: ModuleDefinition<OrdersConfig>;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly api: OrdersService;
}

function bodyOf(request: OrderRequest): CreateOrderInput {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  const body = request.body as { readonly items?: unknown };
  if (!Array.isArray(body.items)) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  return { items: body.items as CreateOrderInput['items'] };
}

function orderId(request: OrderRequest): string {
  const value = request.params?.id;
  if (value === undefined || value.length === 0) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  return value;
}

function idempotencyKey(request: OrderRequest): string | undefined {
  const value = request.headers['idempotency-key'];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/** Builds the optional `orders` module. It knows only the generic ports. */
export function createOrdersModule(options: OrdersModuleOptions): OrdersModule {
  const api = createOrdersService({
    database: options.database,
    buyerContext: options.buyerContext,
    requireIdempotencyKey: options.appConfig.modules.orders.requireIdempotencyKey,
    ...(options.priceResolver === undefined ? {} : { priceResolver: options.priceResolver }),
    ...(options.inventory === undefined ? {} : { inventory: options.inventory }),
  });

  const routeHandlers: readonly ApiRouteDefinition[] = [
    {
      moduleId: 'orders',
      method: 'POST',
      path: '/orders',
      permission: 'orders:create',
      schema: {
        ...successEnvelopeSchema(orderDataSchema),
        body: createBodySchema,
        headers: idempotencyHeadersSchema,
      },
      handler: async (request: FastifyRequest) => {
        const orderRequest = request as OrderRequest;
        const buyer = await options.buyerContext.currentBuyer(orderRequest);
        const key = idempotencyKey(orderRequest);
        return api.create(bodyOf(orderRequest), {
          buyer,
          ...(key === undefined ? {} : { idempotencyKey: key }),
        });
      },
    },
    {
      moduleId: 'orders',
      method: 'GET',
      path: '/orders/:id',
      permission: 'orders:read',
      schema: successEnvelopeSchema(orderDataSchema),
      handler: async (request: FastifyRequest) => {
        const orderRequest = request as OrderRequest;
        const buyer = await options.buyerContext.currentBuyer(orderRequest);
        const canReadAny = (orderRequest.principal?.permissions ?? []).includes('orders:read:any');
        return api.getById(orderId(orderRequest), buyer, canReadAny);
      },
    },
    {
      moduleId: 'orders',
      method: 'GET',
      path: '/orders',
      permission: 'orders:read',
      schema: {
        ...successEnvelopeSchema(listDataSchema),
        querystring: listQuerySchema,
      },
      handler: async (request: FastifyRequest) => {
        const orderRequest = request as OrderRequest;
        const buyer = await options.buyerContext.currentBuyer(orderRequest);
        const limitValue = orderRequest.query?.limit;
        const limit =
          typeof limitValue === 'string' && /^\d+$/.test(limitValue) ? Number(limitValue) : 20;
        const cursor =
          typeof orderRequest.query?.cursor === 'string' ? orderRequest.query.cursor : undefined;
        const result = await api.list({
          buyer,
          limit: Math.min(Math.max(limit, 1), 100),
          ...(cursor === undefined ? {} : { cursor }),
        });
        return pageResult({ orders: result.orders }, result.nextCursor);
      },
    },
  ];

  const definition: ModuleDefinition<OrdersConfig> = {
    id: 'orders',
    version: 1,
    stability: 'experimental',
    requires: ['auth', 'users', 'catalog'],
    consumes: [
      BUYER_CONTEXT_PORT,
      { ...PRICE_RESOLVER_PORT, optional: true },
      { ...INVENTORY_PORT, optional: true },
    ],
    configSchema: ordersModuleConfigSchema,
    permissions: [...ORDERS_PERMISSIONS],
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

export function ordersMigrationsFolder(): string {
  return existsSync(SOURCE_MIGRATIONS_FOLDER) ? SOURCE_MIGRATIONS_FOLDER : BUILT_MIGRATIONS_FOLDER;
}

export async function runOrdersMigrations(database: Database) {
  return database.migrate({ migrationsFolder: ordersMigrationsFolder() });
}
