import { createServer } from '@skeletonstructure/core/api';
import { loadConfig } from '@skeletonstructure/core/config';
import {
  closeDatabase,
  type Database,
  getDatabase,
  initializeDatabase,
} from '@skeletonstructure/core/database';
import { catalogItems } from '@skeletonstructure/module-catalog';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createDemoEcommerceComposition,
  runDemoEcommerceMigrations,
} from '../src/server/composition.js';
import { demoCredentials, seedDemoEcommerce } from '../src/server/seed.js';

interface Envelope<T> {
  readonly data: T;
  readonly meta: { readonly requestId: string };
}

interface Session {
  readonly cookie: string;
  readonly csrfToken: string;
}

let container: StartedPostgreSqlContainer;
let database: Database;
let app: FastifyInstance;

function envelope<T>(body: unknown): Envelope<T> {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error(`Unexpected response: ${JSON.stringify(body)}`);
  }
  return body as Envelope<T>;
}

async function login(email: string, password: string): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  const rawCookie = response.headers['set-cookie'];
  const firstCookie = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;
  expect(typeof firstCookie).toBe('string');
  const body = envelope<{ csrfToken: string }>(response.json());
  return {
    cookie: (firstCookie as string).split(';')[0] ?? '',
    csrfToken: body.data.csrfToken,
  };
}

async function itemIdFor(slug: string): Promise<string> {
  const [row] = await database.db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.slug, slug))
    .limit(1);
  if (row === undefined) throw new Error(`Seed item ${slug} is missing.`);
  return row.id;
}

async function cartItemCount(): Promise<number> {
  const result = await database.db.execute(
    sql`SELECT count(*)::int AS count FROM demo_ecommerce_cart_items`,
  );
  const rows = (result as { rows?: readonly { count?: unknown }[] }).rows ?? [];
  return Number(rows[0]?.count ?? 0);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  const config = await loadConfig({
    cwd: new URL('..', import.meta.url).pathname,
    envFiles: false,
    environment: { DATABASE_URL: container.getConnectionUri(), NODE_ENV: 'test' },
  });
  await initializeDatabase(config.database);
  database = getDatabase();

  const first = await runDemoEcommerceMigrations(database);
  expect(first.cart.appliedCount).toBeGreaterThan(0);
  await seedDemoEcommerce(database, config);

  const composition = await createDemoEcommerceComposition({ appConfig: config, database });
  app = await createServer({
    appConfig: config,
    database,
    activationReport: composition.activationReport,
    routeHandlers: composition.routeHandlers,
    authenticator: composition.authenticator,
    csrfGuard: composition.csrfGuard,
  });
});

beforeEach(async () => {
  await database.db.execute(sql`
    TRUNCATE TABLE
      demo_ecommerce_cart_items,
      demo_ecommerce_carts,
      orders_idempotency,
      orders_order_items,
      orders_orders
    RESTART IDENTITY CASCADE
  `);
  const config = await loadConfig({
    cwd: new URL('..', import.meta.url).pathname,
    envFiles: false,
    environment: { DATABASE_URL: container.getConnectionUri(), NODE_ENV: 'test' },
  });
  await seedDemoEcommerce(database, config);
});

afterAll(async () => {
  await app?.close();
  await closeDatabase().catch(() => undefined);
  await container?.stop();
});

describe('e-commerce demo integration', () => {
  it('applies migrations and seed data repeatedly without drift', async () => {
    const second = await runDemoEcommerceMigrations(database);
    expect(second.cart.appliedCount).toBe(0);

    const config = await loadConfig({
      cwd: new URL('..', import.meta.url).pathname,
      envFiles: false,
      environment: { DATABASE_URL: container.getConnectionUri(), NODE_ENV: 'test' },
    });
    const firstSeed = await seedDemoEcommerce(database, config);
    const secondSeed = await seedDemoEcommerce(database, config);
    expect(firstSeed.products).toBe(3);
    expect(secondSeed).toEqual(firstSeed);
  });

  it('requires authentication and CSRF on every cart route', async () => {
    const anonymousRoutes = [
      { method: 'GET', url: '/v1/cart' },
      { method: 'PUT', url: '/v1/cart/items/cat_dummy', payload: { quantity: 1 } },
      { method: 'DELETE', url: '/v1/cart/items/cat_dummy' },
      { method: 'POST', url: '/v1/cart/checkout', headers: { 'idempotency-key': 'anon-key' } },
    ] as const;

    for (const route of anonymousRoutes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        ...('headers' in route ? { headers: route.headers } : {}),
        ...('payload' in route ? { payload: route.payload } : {}),
      });
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
    }

    const credentials = demoCredentials();
    const session = await login(credentials.email, credentials.password);
    const cookieOnly = { cookie: session.cookie };
    const cookieMutations = [
      {
        method: 'PUT',
        url: '/v1/cart/items/cat_dummy',
        payload: { quantity: 1 },
      },
      { method: 'DELETE', url: '/v1/cart/items/cat_dummy' },
      {
        method: 'POST',
        url: '/v1/cart/checkout',
        headers: { 'idempotency-key': 'no-csrf-key' },
      },
    ] as const;

    for (const route of cookieMutations) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { ...cookieOnly, ...('headers' in route ? route.headers : {}) },
        ...('payload' in route ? { payload: route.payload } : {}),
      });
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(403);
    }
  });

  it('keeps the cart untouched when order creation fails and clears it only on success', async () => {
    const credentials = demoCredentials();
    const session = await login(credentials.email, credentials.password);
    const coffeeId = await itemIdFor('demo-coffee');
    const mugId = await itemIdFor('demo-mug');
    const headers = {
      cookie: session.cookie,
      'x-csrf-token': session.csrfToken,
    };

    const anonymous = await app.inject({ method: 'GET', url: '/v1/cart' });
    expect(anonymous.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'PUT',
      url: `/v1/cart/items/${coffeeId}`,
      headers,
      payload: { quantity: 0 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(await cartItemCount()).toBe(0);

    const added = await app.inject({
      method: 'PUT',
      url: `/v1/cart/items/${coffeeId}`,
      headers,
      payload: { quantity: 2 },
    });
    expect(added.statusCode).toBe(200);
    expect(await cartItemCount()).toBe(1);

    const composition = await createDemoEcommerceComposition({
      appConfig: await loadConfig({
        cwd: new URL('..', import.meta.url).pathname,
        envFiles: false,
        environment: { DATABASE_URL: container.getConnectionUri(), NODE_ENV: 'test' },
      }),
      database,
    });
    await composition.inventory.set(mugId, 0);
    await app.inject({
      method: 'PUT',
      url: `/v1/cart/items/${mugId}`,
      headers,
      payload: { quantity: 1 },
    });

    const failed = await app.inject({
      method: 'POST',
      url: '/v1/cart/checkout',
      headers: { ...headers, 'idempotency-key': 'failure-key' },
    });
    expect(failed.statusCode).toBe(409);
    expect(await cartItemCount()).toBe(2);

    await composition.inventory.set(mugId, 40);
    const success = await app.inject({
      method: 'POST',
      url: '/v1/cart/checkout',
      headers: { ...headers, 'idempotency-key': 'success-key' },
    });
    expect(success.statusCode).toBe(200);
    const checkout = envelope<{
      order: { id: string; status: string; totalAmount: number };
      cartCleared: boolean;
    }>(success.json());
    expect(checkout.data.cartCleared).toBe(true);
    expect(checkout.data.order.status).toBe('confirmed');
    expect(checkout.data.order.totalAmount).toBe(1_850 * 2 + 1_200);
    expect(await cartItemCount()).toBe(0);

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/cart/checkout',
      headers: { ...headers, 'idempotency-key': 'success-key' },
    });
    expect(replay.statusCode).toBe(200);
    expect(envelope<{ order: { id: string } }>(replay.json()).data.order.id).toBe(
      checkout.data.order.id,
    );

    const emptyCart = await app.inject({ method: 'GET', url: '/v1/cart', headers });
    expect(envelope<{ items: readonly unknown[] }>(emptyCart.json()).data.items).toHaveLength(0);
  });

  it('isolates carts between buyers', async () => {
    const credentials = demoCredentials();
    const first = await login(credentials.email, credentials.password);
    const secondEmail = 'second-demo@skeletonstructure.local';
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: secondEmail, password: 'second-demo-password' },
    });
    expect(registered.statusCode).toBe(200);
    const second = await login(secondEmail, 'second-demo-password');
    const coffeeId = await itemIdFor('demo-coffee');

    await app.inject({
      method: 'PUT',
      url: `/v1/cart/items/${coffeeId}`,
      headers: { cookie: first.cookie, 'x-csrf-token': first.csrfToken },
      payload: { quantity: 1 },
    });

    const otherCart = await app.inject({
      method: 'GET',
      url: '/v1/cart',
      headers: { cookie: second.cookie, 'x-csrf-token': second.csrfToken },
    });
    expect(envelope<{ items: readonly unknown[] }>(otherCart.json()).data.items).toHaveLength(0);

    const crossBuyerDelete = await app.inject({
      method: 'DELETE',
      url: `/v1/cart/items/${coffeeId}`,
      headers: { cookie: second.cookie, 'x-csrf-token': second.csrfToken },
    });
    expect(crossBuyerDelete.statusCode).toBe(200);

    const firstCart = await app.inject({
      method: 'GET',
      url: '/v1/cart',
      headers: { cookie: first.cookie, 'x-csrf-token': first.csrfToken },
    });
    expect(envelope<{ items: readonly unknown[] }>(firstCart.json()).data.items).toHaveLength(1);
    expect(await cartItemCount()).toBe(1);
  });
});
