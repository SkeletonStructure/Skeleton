import { createServer } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import { type Database, initializeDatabase } from '@skeletonstructure/core/database';
import { composeModuleRegistry } from '@skeletonstructure/core/modules';
import { createCatalogService, runCatalogMigrations } from '@skeletonstructure/module-catalog';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCatalogModule } from '../../module-catalog/src/index.js';
import {
  createProductsModule,
  PRODUCT_DETAILS_SCHEMA_VERSION,
  PRODUCT_EXTENSION_KIND,
  type ProductsApi,
  runProductsMigrations,
} from '../src/index.js';
import { closeTestDatabase, makeM8Config } from './helpers.js';

interface Envelope {
  readonly data?: Record<string, unknown>;
  readonly error?: { readonly code?: string };
}

const headers = { authorization: 'Bearer test-principal' };

function bodyOf(response: { json(): unknown }): Envelope {
  return response.json() as Envelope;
}

function stringData(body: Envelope, key: string): string {
  const value = body.data?.[key];
  return typeof value === 'string' ? value : '';
}

let container: StartedPostgreSqlContainer | undefined;
let appConfig: AppConfig;
let database: Database;
let productsApi: ProductsApi;
let catalogApi: ReturnType<typeof createCatalogService>;
let app: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  appConfig = await makeM8Config(container.getConnectionUri(), {
    enabled: { catalog: true, products: true },
    defaultCurrency: 'USD',
  });
  database = await initializeDatabase(appConfig.database);
  await runCatalogMigrations(database);
  await runProductsMigrations(database);

  catalogApi = createCatalogService(database);
  const products = createProductsModule({ appConfig, database, catalog: catalogApi });
  productsApi = products.api;
  const catalog = createCatalogModule({
    appConfig,
    database,
    expansionProviders: [products.expansionProvider],
  });
  const registry = composeModuleRegistry({
    appConfig,
    database,
    modules: [catalog.definition, products.definition],
  });
  const activationReport = await registry.activate();

  app = await createServer({
    appConfig,
    database,
    activationReport,
    routeHandlers: [...catalog.routeHandlers, ...products.routeHandlers],
    authenticator: {
      authenticate: async () => ({
        id: 'test-user',
        permissions: ['catalog:read', 'catalog:write', 'products:write'],
      }),
    },
  });
}, 180_000);

beforeEach(async () => {
  await database.db.execute(sql`TRUNCATE TABLE catalog_items RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await app?.close();
  await closeTestDatabase(database);
  await container?.stop();
}, 60_000);

async function createCatalogItem() {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/catalog/items',
    headers,
    payload: { slug: 'desk-lamp', name: 'Desk Lamp' },
  });
  expect(response.statusCode).toBe(200);
  return stringData(bodyOf(response), 'id');
}

describe('products module (Fastify + PostgreSQL integration)', () => {
  it('creates product details only for an existing catalog item', async () => {
    const missing = await app.inject({
      method: 'PATCH',
      url: '/v1/catalog/items/cat_missing/product',
      headers,
      payload: { sku: 'MISSING-1', priceAmount: 100 },
    });
    expect(missing.statusCode).toBe(404);
    expect(bodyOf(missing).error).toMatchObject({ code: 'NOT_FOUND' });

    const id = await createCatalogItem();
    const created = await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${id}/product`,
      headers,
      payload: {
        sku: 'LAMP-1',
        priceAmount: 2499,
        weightGrams: 1200,
        shippingClass: 'parcel',
      },
    });
    expect(created.statusCode).toBe(200);
    expect(bodyOf(created).data).toMatchObject({
      itemId: id,
      sku: 'LAMP-1',
      priceAmount: 2499,
      currency: 'USD',
      weightGrams: 1200,
      shippingClass: 'parcel',
    });

    const duplicate = await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${id}/product`,
      headers,
      payload: { sku: 'LAMP-1', priceAmount: 100 },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(bodyOf(duplicate).data).toMatchObject({ sku: 'LAMP-1', priceAmount: 100 });
  });

  it('rejects a SKU already assigned to another catalog item', async () => {
    const first = await createCatalogItem();
    const secondItem = await catalogApi.create({ slug: 'desk-chair', name: 'Desk Chair' });

    await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${first}/product`,
      headers,
      payload: { sku: 'SHARED-SKU', priceAmount: 500 },
    });
    const conflict = await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${secondItem.id}/product`,
      headers,
      payload: { sku: 'SHARED-SKU', priceAmount: 500 },
    });
    expect(conflict.statusCode).toBe(409);
    expect(bodyOf(conflict).error).toMatchObject({ code: 'CONFLICT' });
  });

  it('loads typed product details through catalog expansion', async () => {
    const id = await createCatalogItem();
    await productsApi.upsert(id, { sku: 'EXPAND-1', priceAmount: 3250 });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/catalog/items/${id}?expand=product`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response).data?.details).toEqual({
      product: {
        sku: 'EXPAND-1',
        priceAmount: 3250,
        currency: 'USD',
      },
    });
  });

  it('resolves server prices and snapshots immutable line data', async () => {
    const id = await createCatalogItem();
    await productsApi.upsert(id, { sku: 'SNAP-1', priceAmount: 700, shippingClass: 'parcel' });

    expect(await productsApi.resolve(id, { buyerKind: 'user' })).toEqual({
      amount: 700,
      currency: 'USD',
    });
    const snapshot = await productsApi.snapshot(id);
    expect(snapshot).toMatchObject({
      itemId: id,
      name: 'Desk Lamp',
      unitAmount: 700,
      currency: 'USD',
      extensionKind: PRODUCT_EXTENSION_KIND,
      detailsSchemaVersion: PRODUCT_DETAILS_SCHEMA_VERSION,
      details: { sku: 'SNAP-1', shippingClass: 'parcel' },
    });

    await catalogApi.update(id, { name: 'Renamed Lamp' });
    await productsApi.upsert(id, { sku: 'SNAP-2', priceAmount: 999 });
    const afterEdit = await productsApi.snapshot(id);
    expect(afterEdit.name).toBe('Renamed Lamp');
    expect(afterEdit.unitAmount).toBe(999);
    expect(snapshot.name).toBe('Desk Lamp');
    expect(snapshot.unitAmount).toBe(700);

    await catalogApi.archive(id);
    await expect(productsApi.snapshot(id)).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
  });
});
