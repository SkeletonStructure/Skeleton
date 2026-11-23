import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { INVENTORY_PORT, PRICE_RESOLVER_PORT } from '@skeletonstructure/module-catalog';
import { describe, expect, it } from 'vitest';

import { createOrdersModule } from '../src/index.js';
import { BUYER_CONTEXT_PORT } from '../src/types.js';

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const database = { db: {} } as never;
const buyerContext = {
  currentBuyer: async () => ({ kind: 'user' as const, id: 'user_1' }),
  owns: () => true,
};

describe('orders module contract', () => {
  it('depends only on generic ports and declares order permissions', () => {
    const module = createOrdersModule({
      appConfig: { modules: { orders: { requireIdempotencyKey: true } } } as never,
      database,
      buyerContext,
    });
    const registration: { method: string; path: string; permission?: string }[] = [];
    module.definition.register({
      http: {
        register: (route: { method: string; path: string; permission?: string }) =>
          registration.push(route),
      },
    } as never);

    expect(module.definition.consumes).toEqual([
      BUYER_CONTEXT_PORT,
      { ...PRICE_RESOLVER_PORT, optional: true },
      { ...INVENTORY_PORT, optional: true },
    ]);
    expect(registration.map((route) => `${route.method} ${route.path}`).sort()).toEqual([
      'GET /orders',
      'GET /orders/:id',
      'POST /orders',
    ]);
  });

  it('does not import concrete product, inventory, auth, or users modules', async () => {
    for (const file of ['src/index.ts', 'src/service.ts', 'src/schema.ts']) {
      const source = await readFile(root(`packages/module-orders/${file}`), 'utf8');
      expect(source).not.toMatch(/module-products|module-inventory|module-auth|module-users/);
    }
  });

  it('is represented in the committed OpenAPI and generated SDK', async () => {
    const openApi = JSON.parse(await readFile(root('openapi/openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    const generated = await readFile(root('packages/sdk/generated/api.ts'), 'utf8');
    const client = await readFile(root('packages/sdk/src/client.ts'), 'utf8');

    expect(openApi.paths['/v1/orders']).toBeDefined();
    expect(openApi.paths['/v1/orders/{id}']).toBeDefined();
    expect(generated).toContain('export type OrdersPostResponse =');
    expect(client).toContain('export interface OrdersClient');
    expect(client).toContain('export interface CreateOrderOptions');
    expect(client).toContain("'idempotency-key': createOptions.idempotencyKey");
  });
});
