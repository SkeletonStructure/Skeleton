import { type Database, initializeDatabase } from '@skeletonstructure/core/database';
import {
  createCatalogService,
  type PriceResolverPort,
  runCatalogMigrations,
} from '@skeletonstructure/module-catalog';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createOrdersService, runOrdersMigrations } from '../src/index.js';
import type { BuyerContextPort, BuyerRef } from '../src/types.js';
import { closeTestDatabase, makeM8Config } from './helpers.js';

const buyer = { kind: 'user', id: 'user_1' } as const;
const otherBuyer: BuyerRef = { kind: 'user', id: 'user_2' };

const buyerContext: BuyerContextPort = {
  currentBuyer: async () => buyer,
  owns: (order, candidate) =>
    candidate.kind === 'user' &&
    order.buyerKind === candidate.kind &&
    order.buyerRef === candidate.id,
};

let container: StartedPostgreSqlContainer | undefined;
let database: Database;
let catalog: ReturnType<typeof createCatalogService>;
let priceResolver: PriceResolverPort;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  const appConfig = await makeM8Config(container.getConnectionUri(), {
    enabled: { catalog: true, orders: true },
  });
  database = await initializeDatabase(appConfig.database);
  await runCatalogMigrations(database);
  await runOrdersMigrations(database);
  catalog = createCatalogService(database);
  priceResolver = {
    resolve: async (itemId) => {
      const item = await catalog.getById(itemId);
      return { amount: 1999, currency: 'USD', ...(item === undefined ? {} : {}) };
    },
    snapshot: async (itemId) => {
      const item = await catalog.getById(itemId);
      if (item === undefined) throw new Error('Catalog item is required.');
      return {
        itemId,
        name: item.name,
        unitAmount: 1999,
        currency: 'USD',
        extensionKind: 'product',
        detailsSchemaVersion: 1,
        details: { sku: `SKU-${itemId}` },
      };
    },
  };
}, 180_000);

beforeEach(async () => {
  await database.db.execute(
    sql`TRUNCATE TABLE catalog_items, orders_orders, orders_order_items, orders_idempotency RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await closeTestDatabase(database);
  await container?.stop();
}, 60_000);

async function createCatalogItem() {
  const item = await catalog.create({ slug: 'order-item', name: 'Order Item' });
  return item.id;
}

describe('orders service (PostgreSQL integration)', () => {
  it('persists server-side snapshots and returns the original idempotent order', async () => {
    const itemId = await createCatalogItem();
    const service = createOrdersService({
      database,
      buyerContext,
      priceResolver,
      requireIdempotencyKey: true,
    });
    const input = { items: [{ itemId, quantity: 2 }] };

    const created = await service.create(input, { buyer, idempotencyKey: 'checkout-1' });
    expect(created).toMatchObject({
      status: 'confirmed',
      buyer: { kind: 'user', id: buyer.id },
      totalAmount: 3998,
      currency: 'USD',
    });
    expect(created.items[0]).toMatchObject({
      itemId,
      name: 'Order Item',
      quantity: 2,
      unitAmount: 1999,
      extensionKind: 'product',
      detailsSchemaVersion: 1,
      details: { sku: `SKU-${itemId}` },
    });

    const duplicate = await service.create(input, { buyer, idempotencyKey: 'checkout-1' });
    expect(duplicate.id).toBe(created.id);

    await expect(
      service.create(
        { items: [{ itemId, quantity: 3 }] },
        {
          buyer,
          idempotencyKey: 'checkout-1',
        },
      ),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });

    await catalog.update(itemId, { name: 'Renamed Item' });
    const afterEdit = await service.getById(created.id, buyer, false);
    expect(afterEdit.items[0]?.name).toBe('Order Item');
  });

  it('enforces ownership unless read-any is granted', async () => {
    const itemId = await createCatalogItem();
    const service = createOrdersService({
      database,
      buyerContext,
      priceResolver,
      requireIdempotencyKey: false,
    });
    const created = await service.create({ items: [{ itemId, quantity: 1 }] }, { buyer });

    await expect(service.getById(created.id, otherBuyer, false)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect((await service.getById(created.id, otherBuyer, true)).id).toBe(created.id);
  });

  it('skips inventory checks when no inventory port is supplied', async () => {
    const itemId = await createCatalogItem();
    const service = createOrdersService({
      database,
      buyerContext,
      priceResolver,
      requireIdempotencyKey: false,
    });
    const created = await service.create({ items: [{ itemId, quantity: 5 }] }, { buyer });
    expect(created.totalAmount).toBe(9995);
  });

  it('returns one order for concurrent requests with the same idempotency key', async () => {
    const itemId = await createCatalogItem();
    const service = createOrdersService({
      database,
      buyerContext,
      priceResolver,
      requireIdempotencyKey: true,
    });
    const input = { items: [{ itemId, quantity: 1 }] };

    const [first, second] = await Promise.all([
      service.create(input, { buyer, idempotencyKey: 'race-key' }),
      service.create(input, { buyer, idempotencyKey: 'race-key' }),
    ]);
    expect(first.id).toBe(second.id);
    expect(await service.list({ buyer, limit: 10 })).toMatchObject({
      orders: [{ id: first.id }],
    });
  });

  it('rejects guest buyers at the service boundary', async () => {
    const itemId = await createCatalogItem();
    const service = createOrdersService({
      database,
      buyerContext,
      priceResolver,
      requireIdempotencyKey: false,
    });

    await expect(
      service.create(
        { items: [{ itemId, quantity: 1 }] },
        { buyer: { kind: 'guest', tokenHash: 'guest-hash' } },
      ),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
