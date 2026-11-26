import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createSkeletonClient } from '../../packages/sdk/src/index.js';

const root = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));

describe('generated artifact regressions', () => {
  it('keeps generated SDK types for public operations', async () => {
    const generated = await readFile(root('packages/sdk/generated/api.ts'), 'utf8');

    for (const alias of [
      'AuthLoginPostBody',
      'CatalogItemsGetResponse',
      'OrdersPostBody',
      'UsersMePatchResponse',
    ]) {
      expect(generated, `missing ${alias}`).toContain(`export type ${alias} =`);
    }
  });

  it('keeps the demo client bound to the committed demo OpenAPI hash', async () => {
    const spec = await readFile(root('apps/demo-ecommerce/openapi/demo-openapi.json'));
    const generated = await readFile(
      root('apps/demo-ecommerce/src/web/demo-client.generated.ts'),
      'utf8',
    );
    const sha = createHash('sha256').update(spec).digest('hex');

    expect(generated).toContain(`Source SHA-256: ${sha}`);
    expect(generated).toContain("checkout: '/v1/cart/checkout'");
  });

  it('normalizes pathological base URLs correctly', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ data: {}, meta: { requestId: 'req_test' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = createSkeletonClient({
      baseUrl: `/v1/${'/'.repeat(5_000)}`,
      fetch: fetchImpl,
    });

    await client.config.getPublic();

    expect(calls).toEqual(['/v1/config/public']);
  });
});
