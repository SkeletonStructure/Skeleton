import type { Database } from '@skeletonstructure/core/database';
import type { ModuleDefinition } from '@skeletonstructure/core/modules';
import { PRICE_RESOLVER_PORT } from '@skeletonstructure/module-catalog';
import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_PRICE_RESOLVER,
  assertSinglePriceResolver,
  CompositionError,
  createM8Composition,
} from '../src/index.js';
import { makeM8Config } from './helpers.js';

const database = { db: {} } as unknown as Database;

function priceResolverModule(id: string): ModuleDefinition {
  return {
    id,
    version: 1,
    stability: 'experimental',
    provides: [PRICE_RESOLVER_PORT],
    register: () => undefined,
    publicApi: {},
  };
}

describe('M8 application composition', () => {
  it('fails with the exact ambiguity code and names both providers and the app', () => {
    expect(() =>
      assertSinglePriceResolver(
        [priceResolverModule('products'), priceResolverModule('menu-pricing')],
        ['products', 'menu-pricing'],
        'Storefront',
      ),
    ).toThrow(CompositionError);

    try {
      assertSinglePriceResolver(
        [priceResolverModule('products'), priceResolverModule('menu-pricing')],
        ['products', 'menu-pricing'],
        'Storefront',
      );
      throw new Error('Expected ambiguity failure.');
    } catch (error) {
      expect(error).toMatchObject({ code: AMBIGUOUS_PRICE_RESOLVER });
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('Storefront');
      expect(message).toContain('products');
      expect(message).toContain('menu-pricing');
    }
  });

  it('allows a single active price resolver', () => {
    expect(() =>
      assertSinglePriceResolver(
        [priceResolverModule('products'), priceResolverModule('menu-pricing')],
        ['products'],
        'Storefront',
      ),
    ).not.toThrow();
  });

  it('detects an application-owned second resolver before activation', async () => {
    const appConfig = await makeM8Config(
      'postgres://placeholder:placeholder@localhost:5432/placeholder',
      {
        appName: 'Dual Price App',
        enabled: {
          auth: true,
          users: true,
          catalog: true,
          products: true,
          inventory: true,
          orders: true,
        },
      },
    );
    const moduleConfig = {
      ...appConfig.modules,
      'menu-pricing': { enabled: true },
    };

    await expect(
      createM8Composition({
        appConfig,
        database,
        moduleConfig,
        additionalModules: [priceResolverModule('menu-pricing')],
      }),
    ).rejects.toMatchObject({ code: AMBIGUOUS_PRICE_RESOLVER });
  });
});
