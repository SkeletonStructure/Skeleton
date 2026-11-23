import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const SDK_SOURCES = [
  'packages/sdk/src/client.ts',
  'packages/sdk/src/errors.ts',
  'packages/sdk/src/index.ts',
  'packages/sdk/generated/api.ts',
];

const EXAMPLE_SOURCES = [
  'examples/frontend-vanilla/src/main.ts',
  'examples/frontend-react/src/App.tsx',
];

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /@skeletonstructure\/core/,
  /@skeletonstructure\/module-/,
  /\bprocess\.env\b/,
  /\bDATABASE_URL\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bdocument\.cookie\b/,
  /\bfrom ['"]node:/,
  /\binnerHTML\b/,
];

describe('SDK contract boundaries', () => {
  it('generates a type alias for every committed operation', async () => {
    const generated = await readFile(root('packages/sdk/generated/api.ts'), 'utf8');
    const expectedAliases = [
      'ConfigPublicGetResponse',
      'UsersMeGetResponse',
      'UsersMePatchResponse',
      'UsersMePatchBody',
      'AuthRegisterPostResponse',
      'AuthRegisterPostBody',
      'AuthLoginPostResponse',
      'AuthLoginPostBody',
      'AuthLogoutPostResponse',
      'AuthMeGetResponse',
      'AuthPasswordResetRequestPostResponse',
      'AuthPasswordResetRequestPostBody',
      'AuthPasswordResetConfirmPostResponse',
      'AuthPasswordResetConfirmPostBody',
      'CatalogItemsGetResponse',
      'CatalogItemsPostResponse',
      'CatalogItemsPostBody',
      'CatalogItemsByIdGetResponse',
      'CatalogItemsByIdPatchResponse',
      'CatalogItemsByIdPatchBody',
      'CatalogItemsByIdDeleteResponse',
      'CatalogItemsByIdProductGetResponse',
      'CatalogItemsByIdProductPatchResponse',
      'CatalogItemsByIdProductPatchBody',
      'InventoryItemsByItemIdGetResponse',
      'InventoryItemsByItemIdPatchResponse',
      'InventoryItemsByItemIdPatchBody',
      'OrdersPostResponse',
      'OrdersPostBody',
      'OrdersGetResponse',
      'OrdersByIdGetResponse',
    ];

    for (const alias of expectedAliases) {
      expect(generated).toContain(`export type ${alias} =`);
    }
  });

  it('exports the M8 client namespaces and order options', async () => {
    const index = await readFile(root('packages/sdk/src/index.ts'), 'utf8');
    for (const symbol of [
      'CatalogClient',
      'ProductsClient',
      'InventoryClient',
      'OrdersClient',
      'CatalogListOptions',
      'CreateOrderOptions',
    ]) {
      expect(index).toContain(symbol);
    }
  });

  it('keeps the SDK free of server imports, config, and browser persistence', async () => {
    for (const source of SDK_SOURCES) {
      const contents = await readFile(root(source), 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(contents, `${source} matches ${pattern}`).not.toMatch(pattern);
      }
    }

    const manifest = JSON.parse(await readFile(root('packages/sdk/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it('keeps examples SDK-only and free of unsafe DOM APIs', async () => {
    for (const source of EXAMPLE_SOURCES) {
      const contents = await readFile(root(source), 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(contents, `${source} matches ${pattern}`).not.toMatch(pattern);
      }
      expect(contents).toContain('@skeletonstructure/sdk');
      expect(contents).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
