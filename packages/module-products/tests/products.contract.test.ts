import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PRICE_RESOLVER_PORT } from '@skeletonstructure/module-catalog';
import { describe, expect, it } from 'vitest';

import { createProductsModule } from '../src/index.js';

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const database = { db: {} } as never;
const appConfig = {
  modules: { catalog: { publicRead: false }, products: { defaultCurrency: 'USD' } },
} as never;
const catalog = { getById: async () => undefined } as never;

describe('products module contract', () => {
  it('advertises its port and owns only product routes', () => {
    const module = createProductsModule({ appConfig, database, catalog });
    const registration: { path: string; permission?: string }[] = [];
    module.definition.register({
      appConfig,
      http: {
        register: (route: { path: string; permission?: string }) => registration.push(route),
      },
    } as never);

    expect(module.definition.requires).toEqual(['catalog']);
    expect(module.definition.provides).toEqual([PRICE_RESOLVER_PORT]);
    expect(registration.map((route) => route.path)).toEqual([
      '/catalog/items/:id/product',
      '/catalog/items/:id/product',
    ]);
  });

  it('does not import orders or inventory', async () => {
    for (const file of ['src/index.ts', 'src/service.ts', 'src/schema.ts']) {
      const source = await readFile(root(`packages/module-products/${file}`), 'utf8');
      expect(source).not.toMatch(/module-orders|module-inventory/);
    }
  });

  it('is represented in the committed OpenAPI and generated SDK', async () => {
    const openApi = JSON.parse(await readFile(root('openapi/openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    const generated = await readFile(root('packages/sdk/generated/api.ts'), 'utf8');
    const client = await readFile(root('packages/sdk/src/client.ts'), 'utf8');

    expect(openApi.paths['/v1/catalog/items/{id}/product']).toBeDefined();
    expect(generated).toContain('export type CatalogItemsByIdProductPatchBody =');
    expect(client).toContain('export interface ProductsClient');
  });
});
