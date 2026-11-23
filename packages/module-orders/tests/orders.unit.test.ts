import type { Database } from '@skeletonstructure/core/database';
import { INVENTORY_PORT, PRICE_RESOLVER_PORT } from '@skeletonstructure/module-catalog';
import { describe, expect, it } from 'vitest';

import { createOrdersModule, createOrdersService } from '../src/index.js';
import { BUYER_CONTEXT_PORT, type BuyerContextPort } from '../src/types.js';

const database = {
  db: {},
  transaction: async () => {
    throw new Error('database must not be used during validation');
  },
} as unknown as Database;

const buyerContext: BuyerContextPort = {
  currentBuyer: async () => ({ kind: 'user', id: 'user_1' }),
  owns: (order, candidate) =>
    candidate.kind === 'user' &&
    order.buyerKind === candidate.kind &&
    order.buyerRef === candidate.id,
};

const priceResolver = {
  resolve: async () => ({ amount: 100, currency: 'USD' }),
  snapshot: async () => ({
    itemId: 'cat_1',
    name: 'Lamp',
    unitAmount: 100,
    currency: 'USD',
    extensionKind: 'product',
    detailsSchemaVersion: 1,
    details: { sku: 'LAMP-1' },
  }),
};

describe('orders module unit contracts', () => {
  it('declares generic port consumption and permissions', () => {
    const config = { requireIdempotencyKey: true };
    const module = createOrdersModule({
      appConfig: { modules: { orders: config } } as never,
      database,
      buyerContext,
    });

    expect(module.definition.requires).toEqual(['auth', 'users', 'catalog']);
    expect(module.definition.consumes).toEqual([
      BUYER_CONTEXT_PORT,
      { ...PRICE_RESOLVER_PORT, optional: true },
      { ...INVENTORY_PORT, optional: true },
    ]);
    expect(module.definition.permissions?.map((permission) => permission.key)).toEqual([
      'orders:create',
      'orders:read',
      'orders:read:any',
    ]);
  });

  it('rejects guest buyers and missing idempotency keys before storage', async () => {
    const service = createOrdersService({
      database,
      buyerContext,
      requireIdempotencyKey: true,
    });
    await expect(
      service.create(
        { items: [{ itemId: 'cat_1', quantity: 1, unitAmount: 100, currency: 'USD' }] },
        { buyer: { kind: 'guest', tokenHash: 'hash' }, idempotencyKey: 'key-1' },
      ),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });

    await expect(
      service.create(
        { items: [{ itemId: 'cat_1', quantity: 1, unitAmount: 100, currency: 'USD' }] },
        { buyer: { kind: 'user', id: 'user_1' } },
      ),
    ).rejects.toMatchObject({
      status: 400,
      details: [{ path: 'headers.idempotency-key' }],
    });
  });

  it('rejects client-supplied amounts when a resolver is enabled', async () => {
    const service = createOrdersService({
      database,
      buyerContext,
      priceResolver,
      requireIdempotencyKey: true,
    });
    await expect(
      service.create(
        { items: [{ itemId: 'cat_1', quantity: 1, unitAmount: 1, currency: 'USD' }] },
        { buyer: { kind: 'user', id: 'user_1' }, idempotencyKey: 'key-2' },
      ),
    ).rejects.toMatchObject({
      status: 400,
      details: [{ path: 'body.items.0' }],
    });
  });

  it('rejects invalid idempotency keys before storage', async () => {
    const service = createOrdersService({
      database,
      buyerContext,
      requireIdempotencyKey: true,
    });
    await expect(
      service.create(
        { items: [{ itemId: 'cat_1', quantity: 1, unitAmount: 100, currency: 'USD' }] },
        { buyer: { kind: 'user', id: 'user_1' }, idempotencyKey: 'bad key!' },
      ),
    ).rejects.toMatchObject({
      status: 400,
      details: [{ path: 'headers.idempotency-key' }],
    });
  });
});
