import type { Authenticator } from '@skeletonstructure/core/api';
import type { Database } from '@skeletonstructure/core/database';
import { describe, expect, it } from 'vitest';

import {
  CATALOG_PERMISSIONS,
  catalogModuleConfigSchema,
  createCatalogModule,
  createCatalogService,
  decodeCursor,
  encodeCursor,
  parseLimit,
} from '../src/index.js';

const database = { db: {} } as unknown as Database;

describe('catalog module unit contracts', () => {
  it('declares catalog permissions, routes, and defaults', () => {
    const config = catalogModuleConfigSchema.parse({});
    const module = createCatalogModule({
      appConfig: {
        modules: { catalog: { ...config, enabled: true } },
      } as never,
      database,
    });

    expect(config).toEqual({ publicRead: false });
    expect(CATALOG_PERMISSIONS.map((permission) => permission.key)).toEqual([
      'catalog:read',
      'catalog:write',
    ]);
    expect(module.definition.id).toBe('catalog');
    expect(module.routeHandlers.map((route) => `${route.method} ${route.path}`).sort()).toEqual([
      'DELETE /catalog/items/:id',
      'GET /catalog/items',
      'GET /catalog/items/:id',
      'PATCH /catalog/items/:id',
      'POST /catalog/items',
    ]);
  });

  it('rejects invalid catalog writes before touching storage', async () => {
    const api = createCatalogService(database);
    await expect(api.create({ slug: 'Bad Slug', name: 'Bad' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'body.slug' }],
    });
    await expect(api.update('cat_missing', { name: '   ' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('validates expansion names generically', async () => {
    const module = createCatalogModule({
      appConfig: {
        modules: { catalog: { enabled: true, publicRead: false } },
      } as never,
      database,
      expansionProviders: [{ kind: 'product', load: async () => undefined }],
    });
    const list = module.routeHandlers.find(
      (route) => route.method === 'GET' && route.path === '/catalog/items',
    );
    expect(list).toBeDefined();

    await expect(
      list?.handler({ query: { expand: 'missing' } } as never, {} as never),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'query.expand', message: expect.stringContaining('Unknown expansion') }],
    });
  });

  it('round-trips cursors and validates limits without database access', () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const cursor = encodeCursor(createdAt, 'cat_123');
    expect(decodeCursor(cursor)).toEqual({ createdAt: createdAt.toISOString(), id: 'cat_123' });
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(parseLimit('5')).toBe(5);
    expect(parseLimit(undefined)).toBe(20);
    expect(() => parseLimit('0')).toThrow();
    expect(() => decodeCursor('not-a-cursor')).toThrow();
  });

  it('passes the authenticator type through without importing auth modules', () => {
    const authenticator: Authenticator = {
      authenticate: async () => ({ id: 'user_1', permissions: ['catalog:read'] }),
    };
    expect(authenticator).toBeDefined();
  });
});
