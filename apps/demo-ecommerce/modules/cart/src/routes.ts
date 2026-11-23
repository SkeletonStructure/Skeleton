import {
  type ApiRouteDefinition,
  HttpError,
  successEnvelopeSchema,
  validationError,
} from '@skeletonstructure/core/api';
import type { FastifyRequest } from 'fastify';

import type { BoundCartService } from './service.js';
import type { DemoBuyerContextPort } from './types.js';

const cartItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId', 'slug', 'name', 'sku', 'unitAmount', 'currency', 'quantity', 'lineAmount'],
  properties: {
    itemId: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    sku: { type: 'string' },
    unitAmount: { type: 'integer' },
    currency: { type: 'string' },
    quantity: { type: 'integer' },
    lineAmount: { type: 'integer' },
  },
} as const;

const cartDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'itemCount', 'totalAmount'],
  properties: {
    items: { type: 'array', items: cartItemSchema },
    itemCount: { type: 'integer' },
    totalAmount: { type: 'integer' },
    currency: { type: 'string' },
    lastOrderId: { type: 'string' },
  },
} as const;

const quantityBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['quantity'],
  properties: {
    quantity: { type: 'integer', minimum: 1, maximum: 99 },
  },
} as const;

const checkoutHeadersSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['idempotency-key'],
  properties: {
    'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const checkoutDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['order', 'cartCleared'],
  properties: {
    order: {
      type: 'object',
      additionalProperties: true,
      required: ['id', 'status', 'items'],
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
    cartCleared: { type: 'boolean' },
  },
} as const;

interface CartRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly principal?: { readonly id?: string };
  readonly params?: { readonly itemId?: string };
  readonly body?: unknown;
}

export interface CreateCartRoutesOptions {
  readonly service: BoundCartService;
  readonly buyerContext: () => DemoBuyerContextPort;
}

export function createCartRoutes(options: CreateCartRoutesOptions): readonly ApiRouteDefinition[] {
  async function buyerRef(request: FastifyRequest): Promise<string> {
    const buyer = await options.buyerContext().currentBuyer(request as CartRequest);
    if (buyer.kind !== 'user' || buyer.id.length === 0) {
      throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
    }
    return buyer.id;
  }

  function itemId(request: FastifyRequest): string {
    const value = (request as CartRequest).params?.itemId;
    if (value === undefined || value.length === 0) {
      throw validationError([{ path: 'params.itemId', message: 'Catalog item ID is required.' }]);
    }
    return value;
  }

  function quantity(request: FastifyRequest): number {
    const body = (request as CartRequest).body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw validationError([{ path: 'body', message: 'A JSON body is required.' }]);
    }
    const value = (body as { readonly quantity?: unknown }).quantity;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw validationError([{ path: 'body.quantity', message: 'Quantity must be an integer.' }]);
    }
    return value;
  }

  function idempotencyKey(request: FastifyRequest): string {
    const value = (request as CartRequest).headers['idempotency-key'];
    const key = Array.isArray(value) ? value[0] : value;
    if (key === undefined || key.length === 0) {
      throw validationError([
        { path: 'headers.idempotency-key', message: 'A valid idempotency key is required.' },
      ]);
    }
    return key;
  }

  return [
    {
      moduleId: 'cart',
      method: 'GET',
      path: '/cart',
      permission: 'cart:read',
      schema: successEnvelopeSchema(cartDataSchema),
      handler: async (request) => options.service.get(await buyerRef(request)),
    },
    {
      moduleId: 'cart',
      method: 'PUT',
      path: '/cart/items/:itemId',
      permission: 'cart:write',
      schema: { ...successEnvelopeSchema(cartDataSchema), body: quantityBodySchema },
      handler: async (request) =>
        options.service.setItem(await buyerRef(request), itemId(request), quantity(request)),
    },
    {
      moduleId: 'cart',
      method: 'DELETE',
      path: '/cart/items/:itemId',
      permission: 'cart:write',
      schema: successEnvelopeSchema(cartDataSchema),
      handler: async (request) =>
        options.service.removeItem(await buyerRef(request), itemId(request)),
    },
    {
      moduleId: 'cart',
      method: 'POST',
      path: '/cart/checkout',
      permission: 'cart:checkout',
      schema: {
        ...successEnvelopeSchema(checkoutDataSchema),
        headers: checkoutHeadersSchema,
      },
      handler: async (request) =>
        options.service.checkout(await buyerRef(request), idempotencyKey(request)),
    },
  ];
}
