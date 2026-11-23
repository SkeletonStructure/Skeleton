import { createServer } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import { type Database, initializeDatabase } from '@skeletonstructure/core/database';
import { composeModuleRegistry } from '@skeletonstructure/core/modules';
import { createCatalogService, runCatalogMigrations } from '@skeletonstructure/module-catalog';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createInventoryModule, inventoryItems, runInventoryMigrations } from '../src/index.js';
import { closeTestDatabase, makeM8Config } from './helpers.js';

interface Envelope {
  readonly data?: Record<string, unknown>;
  readonly error?: { readonly code?: string };
}

const headers = { authorization: 'Bearer test-principal' };

function bodyOf(response: { json(): unknown }): Envelope {
  return response.json() as Envelope;
}

let container: StartedPostgreSqlContainer | undefined;
let appConfig: AppConfig;
let database: Database;
let catalogApi: ReturnType<typeof createCatalogService>;
let inventoryApi: ReturnType<typeof createInventoryModule>['api'];
let app: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  appConfig = await makeM8Config(container.getConnectionUri(), {
    enabled: { catalog: true, inventory: true },
    allowNegativeStock: false,
  });
  database = await initializeDatabase(appConfig.database);
  await runCatalogMigrations(database);
  await runInventoryMigrations(database);

  catalogApi = createCatalogService(database);
  const inventory = createInventoryModule({ appConfig, database, catalog: catalogApi });
  inventoryApi = inventory.api;
  const catalogModule = {
    id: 'catalog' as const,
    version: 1,
    stability: 'experimental' as const,
    permissions: [
      { key: 'catalog:read', description: 'Read catalog items.' },
      { key: 'catalog:write', description: 'Write catalog items.' },
    ],
    register: () => undefined,
    publicApi: catalogApi,
  };
  const registry = composeModuleRegistry({
    appConfig,
    database,
    modules: [catalogModule, inventory.definition],
  });
  const activationReport = await registry.activate();

  app = await createServer({
    appConfig,
    database,
    activationReport,
    routeHandlers: inventory.routeHandlers,
    authenticator: {
      authenticate: async () => ({
        id: 'test-user',
        permissions: ['catalog:read', 'inventory:read', 'inventory:write'],
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
  return catalogApi.create({ slug: 'stock-item', name: 'Stock Item' });
}

describe('inventory module (Fastify + PostgreSQL integration)', () => {
  it('sets and reads stock for a catalog item', async () => {
    const item = await createCatalogItem();
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/inventory/items/${item.id}`,
      headers,
      payload: { quantity: 7 },
    });
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response).data).toMatchObject({ itemId: item.id, quantity: 7, reserved: 0 });

    const read = await app.inject({
      method: 'GET',
      url: `/v1/inventory/items/${item.id}`,
      headers,
    });
    expect(read.statusCode).toBe(200);
    expect(bodyOf(read).data).toMatchObject({ itemId: item.id, quantity: 7, reserved: 0 });
  });

  it('rejects negative stock by default and enforces the catalog foreign key', async () => {
    const item = await createCatalogItem();
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/inventory/items/${item.id}`,
      headers,
      payload: { quantity: -1 },
    });
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response).error).toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      database.db.insert(inventoryItems).values({
        catalogItemId: 'cat_missing',
        quantity: 1,
        reserved: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('reserves and releases stock without overselling', async () => {
    const item = await createCatalogItem();
    await inventoryApi.set(item.id, 2);

    await expect(inventoryApi.tryReserve([{ itemId: item.id, quantity: 3 }])).rejects.toMatchObject(
      { status: 409, code: 'CONFLICT' },
    );
    expect(await inventoryApi.get(item.id)).toMatchObject({ quantity: 2, reserved: 0 });

    await inventoryApi.tryReserve([{ itemId: item.id, quantity: 2 }]);
    expect(await inventoryApi.get(item.id)).toMatchObject({ quantity: 0, reserved: 2 });
    await inventoryApi.release([{ itemId: item.id, quantity: 2 }]);
    expect(await inventoryApi.get(item.id)).toMatchObject({ quantity: 2, reserved: 0 });
  });

  it('allows only one concurrent reservation for the last unit', async () => {
    const item = await createCatalogItem();
    await inventoryApi.set(item.id, 1);

    const results = await Promise.allSettled([
      inventoryApi.tryReserve([{ itemId: item.id, quantity: 1 }]),
      inventoryApi.tryReserve([{ itemId: item.id, quantity: 1 }]),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await inventoryApi.get(item.id)).toMatchObject({ quantity: 0, reserved: 1 });
  });
});
