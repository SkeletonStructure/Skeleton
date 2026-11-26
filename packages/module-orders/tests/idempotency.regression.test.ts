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
      await catalog.getById(itemId);
      return { amount: 1_999, currency: 'USD' };
    },
    snapshot: async (itemId) => {
      const item = await catalog.getById(itemId);
      if (item === undefined) throw new Error('Catalog item is required.');
      return {
        itemId,
        name: item.name,
        unitAmount: 1_999,
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

describe('order idempotency regression', () => {
  it('returns one order for concurrent requests with the same idempotency key', async () => {
    const item = await catalog.create({ slug: 'idempotency-item', name: 'Idempotency Item' });
    const service = createOrdersService({
      database,
      buyerContext,
      priceResolver,
      requireIdempotencyKey: true,
    });
    const input = { items: [{ itemId: item.id, quantity: 2 }] };

    const [first, second] = await Promise.all([
      service.create(input, { buyer: buyer as BuyerRef, idempotencyKey: 'concurrent-key' }),
      service.create(input, { buyer: buyer as BuyerRef, idempotencyKey: 'concurrent-key' }),
    ]);

    expect(second.id).toBe(first.id);
    expect(await service.list({ buyer, limit: 10 })).toMatchObject({
      orders: [{ id: first.id }],
    });
  });
});
