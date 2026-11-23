import { createServer } from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import { type Database, initializeDatabase } from '@skeletonstructure/core/database';
import { composeModuleRegistry } from '@skeletonstructure/core/modules';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCatalogModule, runCatalogMigrations } from '../src/index.js';
import { closeTestDatabase, makeM8Config } from './helpers.js';

interface Envelope {
  readonly data?: Record<string, unknown>;
  readonly meta?: { readonly requestId?: string; readonly nextCursor?: string };
  readonly error?: {
    readonly code?: string;
    readonly details?: readonly { readonly path?: string }[];
  };
}

const headers = { authorization: 'Bearer test-principal' };

function bodyOf(response: { json(): unknown }): Envelope {
  return response.json() as Envelope;
}

function stringData(body: Envelope, key: string): string {
  const value = body.data?.[key];
  return typeof value === 'string' ? value : '';
}

function idsOf(body: Envelope): string[] {
  const items = body.data?.items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => String((item as { id?: unknown }).id ?? ''));
}

let container: StartedPostgreSqlContainer | undefined;
let appConfig: AppConfig;
let database: Database;
let app: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  appConfig = await makeM8Config(container.getConnectionUri(), {
    enabled: { catalog: true },
  });
  database = await initializeDatabase(appConfig.database);
  await runCatalogMigrations(database);

  const module = createCatalogModule({
    appConfig,
    database,
    expansionProviders: [
      {
        kind: 'product',
        load: async (itemId) => ({ sku: `SKU-${itemId}`, priceAmount: 1250 }),
      },
    ],
  });
  const registry = composeModuleRegistry({
    appConfig,
    database,
    modules: [module.definition],
  });
  const activationReport = await registry.activate();

  app = await createServer({
    appConfig,
    database,
    activationReport,
    routeHandlers: module.routeHandlers,
    authenticator: {
      authenticate: async () => ({
        id: 'test-user',
        permissions: ['catalog:read', 'catalog:write'],
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

async function createItem(slug: string, name: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/catalog/items',
    headers,
    payload: { slug, name },
  });
  expect(response.statusCode).toBe(200);
  return stringData(bodyOf(response), 'id');
}

describe('catalog module (Fastify + PostgreSQL integration)', () => {
  it('creates, lists, updates, and archives catalog items', async () => {
    const id = await createItem('desk-lamp', 'Desk Lamp');

    const update = await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${id}`,
      headers,
      payload: { name: 'Adjustable Desk Lamp', description: 'Warm white' },
    });
    expect(update.statusCode).toBe(200);
    expect(bodyOf(update).data).toMatchObject({
      id,
      name: 'Adjustable Desk Lamp',
      description: 'Warm white',
      status: 'active',
    });

    const archive = await app.inject({
      method: 'DELETE',
      url: `/v1/catalog/items/${id}`,
      headers,
    });
    expect(archive.statusCode).toBe(200);
    expect(bodyOf(archive).data).toMatchObject({ id, status: 'archived' });

    const archived = await app.inject({
      method: 'GET',
      url: '/v1/catalog/items?status=archived',
      headers,
    });
    const active = await app.inject({
      method: 'GET',
      url: '/v1/catalog/items?status=active',
      headers,
    });
    expect(idsOf(bodyOf(archived))).toContain(id);
    expect(idsOf(bodyOf(active))).not.toContain(id);
  });

  it('validates expansion names and loads registered expansions', async () => {
    const id = await createItem('product-one', 'Product One');

    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/catalog/items?expand=unknown',
      headers,
    });
    expect(invalid.statusCode).toBe(400);
    expect(bodyOf(invalid).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'query.expand' }],
    });

    const expanded = await app.inject({
      method: 'GET',
      url: `/v1/catalog/items/${id}?expand=product`,
      headers,
    });
    expect(expanded.statusCode).toBe(200);
    expect(bodyOf(expanded).data?.details).toEqual({
      product: { sku: `SKU-${id}`, priceAmount: 1250 },
    });
  });

  it('paginates with optional cursor metadata', async () => {
    await createItem('one', 'One');
    await createItem('two', 'Two');
    await createItem('three', 'Three');

    const first = await app.inject({
      method: 'GET',
      url: '/v1/catalog/items?limit=2',
      headers,
    });
    const firstBody = bodyOf(first);
    expect(first.statusCode).toBe(200);
    expect(firstBody.data?.items as unknown[]).toHaveLength(2);
    const cursor = firstBody.meta?.nextCursor;
    expect(cursor).toBeTypeOf('string');

    const second = await app.inject({
      method: 'GET',
      url: `/v1/catalog/items?limit=2&cursor=${encodeURIComponent(cursor ?? '')}`,
      headers,
    });
    expect(second.statusCode).toBe(200);
    expect(bodyOf(second).data?.items as unknown[]).toHaveLength(1);
    expect(bodyOf(second).meta?.nextCursor).toBeUndefined();
  });
});
