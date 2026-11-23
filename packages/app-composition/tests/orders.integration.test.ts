import { createServer } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import { type Database, initializeDatabase } from '@skeletonstructure/core/database';
import { createInMemoryEmailProvider } from '@skeletonstructure/module-auth';
import { orders } from '@skeletonstructure/module-orders';
import { rolePermissions } from '@skeletonstructure/module-users';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createM8Composition, runM8Migrations } from '../src/index.js';
import { closeTestDatabase, makeM8Config } from './helpers.js';

const PASSWORD = 'CorrectHorse9!';

interface Envelope {
  readonly data?: Record<string, unknown>;
  readonly meta?: { readonly requestId?: string; readonly nextCursor?: string };
  readonly error?: { readonly code?: string };
}

interface OrderLineData {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly currency: string;
  readonly extensionKind: string;
  readonly detailsSchemaVersion: number;
  readonly details: Record<string, unknown>;
}

interface OrderData {
  readonly id: string;
  readonly buyer: { readonly kind: string; readonly id: string };
  readonly items: readonly OrderLineData[];
  readonly totalAmount: number;
  readonly currency: string;
}

type TestApp = Awaited<ReturnType<typeof createServer>>;

function bodyOf(response: { json(): unknown }): Envelope {
  return response.json() as Envelope;
}

function orderData(response: { json(): unknown }): OrderData {
  return bodyOf(response).data as unknown as OrderData;
}

function ordersOf(body: Envelope): unknown[] {
  const orders = body.data?.orders;
  return Array.isArray(orders) ? orders : [];
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function cookieValue(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw.join(';') : typeof raw === 'string' ? raw : '';
  return header.match(/skel_session=([^;]+)/)?.[1] ?? '';
}

let container: StartedPostgreSqlContainer | undefined;
let appConfig: AppConfig;
let noInventoryConfig: AppConfig;
let database: Database;
let app: TestApp;
let noInventoryApp: TestApp;
let ownerToken: string;
let otherToken: string;

async function buildApp(config: AppConfig): Promise<TestApp> {
  const composition = await createM8Composition({
    appConfig: config,
    database,
    emailProvider: createInMemoryEmailProvider(),
  });
  return createServer({
    appConfig: config,
    database,
    activationReport: composition.activationReport,
    routeHandlers: composition.routeHandlers,
    authenticator: composition.authenticator,
    csrfGuard: composition.csrfGuard,
  });
}

async function registerUser(target: TestApp, email: string): Promise<string> {
  const response = await target.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return cookieValue(response);
}

async function grantPermission(permission: string): Promise<void> {
  await database.db
    .insert(rolePermissions)
    .values({ role: 'user', permission })
    .onConflictDoNothing();
}

async function createProduct(target: TestApp, token: string, stock?: number) {
  const itemResponse = await target.inject({
    method: 'POST',
    url: '/v1/catalog/items',
    headers: bearer(token),
    payload: { slug: 'order-item', name: 'Order Item' },
  });
  expect(itemResponse.statusCode).toBe(200);
  const itemId = String(bodyOf(itemResponse).data?.id ?? '');

  const productResponse = await target.inject({
    method: 'PATCH',
    url: `/v1/catalog/items/${itemId}/product`,
    headers: bearer(token),
    payload: { sku: `ORDER-${itemId}`, priceAmount: 1999 },
  });
  expect(productResponse.statusCode).toBe(200);

  if (stock !== undefined) {
    const inventoryResponse = await target.inject({
      method: 'PATCH',
      url: `/v1/inventory/items/${itemId}`,
      headers: bearer(token),
      payload: { quantity: stock },
    });
    expect(inventoryResponse.statusCode).toBe(200);
  }
  return itemId;
}

function createOrderRequest(
  target: TestApp,
  token: string,
  itemId: string,
  idempotencyKey: string,
  quantity = 1,
  extra: Record<string, unknown> = {},
) {
  return target.inject({
    method: 'POST',
    url: '/v1/orders',
    headers: { ...bearer(token), 'idempotency-key': idempotencyKey },
    payload: {
      items: [{ itemId, quantity, ...extra }],
    },
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  const url = container.getConnectionUri();
  appConfig = await makeM8Config(url, {
    appName: 'M8 Full',
    enabled: {
      auth: true,
      users: true,
      catalog: true,
      products: true,
      inventory: true,
      orders: true,
    },
  });
  noInventoryConfig = await makeM8Config(url, {
    appName: 'M8 Without Inventory',
    enabled: {
      auth: true,
      users: true,
      catalog: true,
      products: true,
      orders: true,
    },
  });
  database = await initializeDatabase(appConfig.database);
  await runM8Migrations(database);

  const registrationApp = await buildApp(appConfig);
  ownerToken = await registerUser(registrationApp, 'owner@example.com');
  otherToken = await registerUser(registrationApp, 'other@example.com');
  await registrationApp.close();

  for (const permission of [
    'catalog:read',
    'catalog:write',
    'products:write',
    'inventory:read',
    'inventory:write',
    'orders:create',
    'orders:read',
  ]) {
    await grantPermission(permission);
  }

  app = await buildApp(appConfig);
  noInventoryApp = await buildApp(noInventoryConfig);
}, 180_000);

beforeEach(async () => {
  await database.db.execute(
    sql`TRUNCATE TABLE catalog_items, orders_orders, orders_idempotency RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await app?.close();
  await noInventoryApp?.close();
  await closeTestDatabase(database);
  await container?.stop();
}, 60_000);

describe('orders module (Fastify + PostgreSQL integration)', () => {
  it('uses server prices, returns the original idempotent result, and snapshots line data', async () => {
    const itemId = await createProduct(app, ownerToken, 5);

    const clientPrice = await createOrderRequest(app, ownerToken, itemId, 'client-price', 1, {
      unitAmount: 1,
      currency: 'USD',
    });
    expect(clientPrice.statusCode).toBe(400);
    expect(bodyOf(clientPrice).error).toMatchObject({ code: 'VALIDATION_ERROR' });

    const createdResponse = await createOrderRequest(app, ownerToken, itemId, 'checkout-1', 2);
    expect(createdResponse.statusCode).toBe(200);
    const created = orderData(createdResponse);
    expect(created).toMatchObject({
      status: 'confirmed',
      buyer: { kind: 'user' },
      totalAmount: 3998,
      currency: 'USD',
    });
    expect(created.items[0]).toMatchObject({
      itemId,
      name: 'Order Item',
      quantity: 2,
      unitAmount: 1999,
      currency: 'USD',
      extensionKind: 'product',
      detailsSchemaVersion: 1,
      details: { sku: `ORDER-${itemId}` },
    });

    const duplicate = await createOrderRequest(app, ownerToken, itemId, 'checkout-1', 2);
    expect(duplicate.statusCode).toBe(200);
    expect(orderData(duplicate).id).toBe(created.id);

    const changedPayload = await createOrderRequest(app, ownerToken, itemId, 'checkout-1', 3);
    expect(changedPayload.statusCode).toBe(409);
    expect(bodyOf(changedPayload).error).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    const ownRead = await app.inject({
      method: 'GET',
      url: `/v1/orders/${created.id}`,
      headers: bearer(ownerToken),
    });
    expect(ownRead.statusCode).toBe(200);

    const foreignRead = await app.inject({
      method: 'GET',
      url: `/v1/orders/${created.id}`,
      headers: bearer(otherToken),
    });
    expect(foreignRead.statusCode).toBe(403);

    await grantPermission('orders:read:any');
    const privilegedRead = await app.inject({
      method: 'GET',
      url: `/v1/orders/${created.id}`,
      headers: bearer(otherToken),
    });
    expect(privilegedRead.statusCode).toBe(200);

    await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${itemId}`,
      headers: bearer(ownerToken),
      payload: { name: 'Renamed Order Item' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${itemId}/product`,
      headers: bearer(ownerToken),
      payload: { sku: `CHANGED-${itemId}`, priceAmount: 899 },
    });
    const afterEdit = await app.inject({
      method: 'GET',
      url: `/v1/orders/${created.id}`,
      headers: bearer(ownerToken),
    });
    expect(orderData(afterEdit).items[0]).toMatchObject({
      name: 'Order Item',
      unitAmount: 1999,
      details: { sku: `ORDER-${itemId}` },
    });
  });

  it('rejects concurrent oversell with inventory enabled', async () => {
    const itemId = await createProduct(app, ownerToken, 1);

    const results = await Promise.allSettled([
      createOrderRequest(app, ownerToken, itemId, 'race-a', 1),
      createOrderRequest(app, ownerToken, itemId, 'race-b', 1),
    ]);
    const statuses = results.map((result) =>
      result.status === 'fulfilled' ? result.value.statusCode : -1,
    );
    expect(statuses.sort()).toEqual([200, 409]);

    const inventory = await app.inject({
      method: 'GET',
      url: `/v1/inventory/items/${itemId}`,
      headers: bearer(ownerToken),
    });
    expect(bodyOf(inventory).data).toMatchObject({ quantity: 0, reserved: 1 });
  });

  it('skips stock checks when inventory is disabled and paginates order history', async () => {
    const itemId = await createProduct(noInventoryApp, ownerToken);

    for (const key of ['no-stock-1', 'no-stock-2', 'no-stock-3']) {
      const response = await createOrderRequest(noInventoryApp, ownerToken, itemId, key);
      expect(response.statusCode).toBe(200);
    }

    const firstPage = await noInventoryApp.inject({
      method: 'GET',
      url: '/v1/orders?limit=2',
      headers: bearer(ownerToken),
    });
    const firstBody = bodyOf(firstPage);
    expect(firstPage.statusCode).toBe(200);
    expect(ordersOf(firstBody)).toHaveLength(2);
    expect(firstBody.meta?.nextCursor).toBeTypeOf('string');

    const secondPage = await noInventoryApp.inject({
      method: 'GET',
      url: `/v1/orders?limit=2&cursor=${encodeURIComponent(firstBody.meta?.nextCursor ?? '')}`,
      headers: bearer(ownerToken),
    });
    expect(secondPage.statusCode).toBe(200);
    expect(ordersOf(bodyOf(secondPage))).toHaveLength(1);
  });

  it('enforces user-only buyers at the database boundary', async () => {
    await expect(
      database.db.insert(orders).values({
        id: 'ord_guest_test',
        status: 'confirmed',
        buyerKind: 'guest',
        buyerRef: 'guest-token-hash',
        idempotencyKey: null,
        requestHash: null,
        totalAmount: 0,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
