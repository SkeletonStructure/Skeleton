import type { Database } from '@skeletonstructure/core/database';
import { INVENTORY_PORT } from '@skeletonstructure/module-catalog';
import { describe, expect, it } from 'vitest';

import {
  createInventoryModule,
  createInventoryService,
  inventoryModuleConfigSchema,
} from '../src/index.js';

const database = { db: {} } as unknown as Database;
const appConfig = {
  modules: { catalog: { publicRead: false }, inventory: { allowNegativeStock: false } },
} as never;
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

describe('inventory module unit contracts', () => {
  it('requires catalog, provides the inventory port, and owns two routes', () => {
    const config = inventoryModuleConfigSchema.parse({});
    const module = createInventoryModule({ appConfig, database, catalog });

    expect(config).toEqual({ allowNegativeStock: false });
    expect(module.definition.requires).toEqual(['catalog']);
    expect(module.definition.provides).toEqual([INVENTORY_PORT]);
    expect(module.routeHandlers.map((route) => `${route.method} ${route.path}`).sort()).toEqual([
      'GET /inventory/items/:itemId',
      'PATCH /inventory/items/:itemId',
    ]);
  });

  it('rejects invalid stock changes before storage access', async () => {
    const api = createInventoryService({ database, catalog, allowNegativeStock: false });

    await expect(api.set('cat_1', -1)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'body.quantity' }],
    });
    await expect(api.tryReserve([{ itemId: 'cat_1', quantity: 0 }])).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    await expect(api.release([{ itemId: 'cat_1', quantity: -2 }])).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('keeps stock keyed by catalog item IDs', async () => {
    const seen: string[] = [];
    const recordingCatalog = {
      getById: async (id: string) => {
        seen.push(id);
        throw new Error('stop-after-validation');
      },
    } as never;
    const api = createInventoryService({
      database,
      catalog: recordingCatalog,
      allowNegativeStock: false,
    });

    await expect(api.set('cat_42', 5)).rejects.toThrow('stop-after-validation');
    expect(seen).toEqual(['cat_42']);
  });
});
