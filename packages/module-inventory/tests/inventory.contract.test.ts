import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { INVENTORY_PORT } from '@skeletonstructure/module-catalog';
import { describe, expect, it } from 'vitest';

import { createInventoryModule } from '../src/index.js';

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const database = { db: {} } as never;
const appConfig = {
  modules: { catalog: { publicRead: false }, inventory: { allowNegativeStock: false } },
} as never;
const catalog = { getById: async () => undefined } as never;

describe('inventory module contract', () => {
  it('declares its dependency, port, permissions, and routes', () => {
    const module = createInventoryModule({ appConfig, database, catalog });
    const registration: { path: string; permission?: string }[] = [];
    module.definition.register({
      http: {
        register: (route: { path: string; permission?: string }) => registration.push(route),
      },
    } as never);

    expect(module.definition.requires).toEqual(['catalog']);
    expect(module.definition.provides).toEqual([INVENTORY_PORT]);
    expect(module.definition.permissions?.map((permission) => permission.key).sort()).toEqual([
      'inventory:read',
      'inventory:write',
    ]);
    expect(registration.map((route) => route.path)).toEqual([
      '/inventory/items/:itemId',
      '/inventory/items/:itemId',
    ]);
  });

  it('does not import products or orders', async () => {
    for (const file of ['src/index.ts', 'src/service.ts', 'src/schema.ts']) {
      const source = await readFile(root(`packages/module-inventory/${file}`), 'utf8');
      expect(source).not.toMatch(/module-products|module-orders/);
    }
  });

  it('is represented in the committed OpenAPI and generated SDK', async () => {
    const openApi = JSON.parse(await readFile(root('openapi/openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    const generated = await readFile(root('packages/sdk/generated/api.ts'), 'utf8');
    const client = await readFile(root('packages/sdk/src/client.ts'), 'utf8');

    expect(openApi.paths['/v1/inventory/items/{itemId}']).toBeDefined();
    expect(client).toContain('export interface InventoryClient');
    expect(generated).toContain('export type InventoryItemsByItemIdPatchBody =');
  });
});
