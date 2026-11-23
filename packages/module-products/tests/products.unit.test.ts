import { HttpError } from '@skeletonstructure/core/api';
import type { Database } from '@skeletonstructure/core/database';
import { PRICE_RESOLVER_PORT } from '@skeletonstructure/module-catalog';
import { describe, expect, it } from 'vitest';

import {
  createProductExpansionProvider,
  createProductsModule,
  createProductsService,
  PRODUCT_DETAILS_SCHEMA_VERSION,
  PRODUCT_EXTENSION_KIND,
  productsModuleConfigSchema,
} from '../src/index.js';

const database = { db: {} } as unknown as Database;
const catalog = {
  getById: async () => ({
    id: 'cat_1',
    slug: 'lamp',
    name: 'Lamp',
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
} as never;

describe('products module unit contracts', () => {
  it('requires catalog and provides the price resolver port', () => {
    const config = productsModuleConfigSchema.parse({});
    const module = createProductsModule({
      appConfig: { modules: { catalog: { publicRead: false }, products: config } } as never,
      database,
      catalog,
    });

    expect(config).toEqual({ defaultCurrency: 'USD' });
    expect(module.definition.requires).toEqual(['catalog']);
    expect(module.definition.provides).toEqual([PRICE_RESOLVER_PORT]);
    expect(module.routeHandlers.map((route) => `${route.method} ${route.path}`).sort()).toEqual([
      'GET /catalog/items/:id/product',
      'PATCH /catalog/items/:id/product',
    ]);
  });

  it('validates product writes before touching storage', async () => {
    const api = createProductsService({ database, catalog, defaultCurrency: 'USD' });
    await expect(
      api.upsert('cat_1', { sku: 'x', priceAmount: -1, currency: 'usd' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([{ path: 'body.sku', message: expect.any(String) }]),
    });
  });

  it('treats a missing product expansion as absent', async () => {
    const missing = createProductExpansionProvider({
      getByItemId: async () => {
        throw new HttpError({ status: 404, code: 'NOT_FOUND' });
      },
    } as never);
    expect(await missing.load('cat_missing')).toBeUndefined();

    const broken = createProductExpansionProvider({
      getByItemId: async () => {
        throw new HttpError({ status: 500, code: 'INTERNAL' });
      },
    } as never);
    await expect(broken.load('cat_1')).rejects.toMatchObject({ status: 500 });
  });

  it('uses stable snapshot identifiers', () => {
    expect(PRODUCT_EXTENSION_KIND).toBe('product');
    expect(PRODUCT_DETAILS_SCHEMA_VERSION).toBe(1);
  });
});
