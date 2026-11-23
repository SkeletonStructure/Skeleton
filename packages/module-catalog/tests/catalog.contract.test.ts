import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CATALOG_PERMISSIONS, createCatalogModule, PRICE_RESOLVER_PORT } from '../src/index.js';

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const database = { db: {} } as never;
const appConfig = {
  modules: { catalog: { enabled: true, publicRead: false } },
} as never;

describe('catalog module contract', () => {
  it('declares only catalog-owned HTTP routes and permissions', () => {
    const module = createCatalogModule({ appConfig, database });
    const registration: { method: string; path: string; permission?: string }[] = [];
    module.definition.register({
      http: {
        register: (route: { method: string; path: string; permission?: string }) => {
          registration.push(route);
        },
      },
    } as never);

    expect(registration).toHaveLength(5);
    expect(registration.every((route) => route.path.startsWith('/catalog/items'))).toBe(true);
    expect(CATALOG_PERMISSIONS.map((permission) => permission.key)).toEqual([
      'catalog:read',
      'catalog:write',
    ]);
    expect(module.definition.requires ?? []).toEqual([]);
    expect(module.definition.provides ?? []).toEqual([]);
  });

  it('publishes generic provider contracts without importing concrete extensions', async () => {
    expect(PRICE_RESOLVER_PORT).toEqual({ id: 'price-resolver', version: 1 });
    const source = await readFile(root('packages/module-catalog/src/index.ts'), 'utf8');
    expect(source).not.toMatch(/module-products|module-inventory|module-orders/);
  });

  it('is represented in the committed OpenAPI and generated SDK', async () => {
    const openApi = JSON.parse(await readFile(root('openapi/openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    const generated = await readFile(root('packages/sdk/generated/api.ts'), 'utf8');

    for (const path of [
      '/v1/catalog/items',
      '/v1/catalog/items/{id}',
      '/v1/catalog/items/{id}/product',
    ]) {
      expect(openApi.paths[path]).toBeDefined();
    }
    expect(generated).toContain('export type CatalogItemsGetResponse =');
    expect(generated).toContain('details?: Record<string, unknown>;');
  });
});
