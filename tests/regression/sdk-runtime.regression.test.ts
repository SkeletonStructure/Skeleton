import { createServer } from '@skeletonstructure/core/api';
import { defineConfig, env, loadConfig } from '@skeletonstructure/core/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createSkeletonClient,
  NotFoundError,
  type SkeletonClient,
} from '../../packages/sdk/src/index.js';

const DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';

let app: Awaited<ReturnType<typeof createServer>> | undefined;
let client: SkeletonClient;

beforeAll(async () => {
  const appConfig = await loadConfig({
    envFiles: false,
    environment: { DATABASE_URL },
    config: () =>
      defineConfig({
        database: { url: env('DATABASE_URL') },
      }),
  });
  app = await createServer({ appConfig });

  const fetchViaServer: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const rawUrl = request?.url ?? (typeof input === 'string' ? input : input.href);
    const url = new URL(rawUrl, 'http://sdk.test');
    const method = init?.method ?? request?.method ?? 'GET';
    const headers = new Headers(init?.headers ?? request?.headers);
    const rawBody = init?.body ?? (request === undefined ? undefined : await request.text());
    const payload =
      rawBody === undefined || rawBody === null
        ? undefined
        : typeof rawBody === 'string'
          ? rawBody
          : await new Response(rawBody).text();

    const response = await app?.inject({
      method,
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(headers.entries()),
      ...(payload === undefined ? {} : { payload }),
    });
    if (response === undefined) throw new Error('Test server is not initialized.');

    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') responseHeaders[name] = value;
      else if (Array.isArray(value)) responseHeaders[name] = value.join(', ');
    }
    return new Response(response.payload, {
      status: response.statusCode,
      headers: responseHeaders,
    });
  };

  client = createSkeletonClient({ fetch: fetchViaServer });
});

afterAll(async () => {
  await app?.close();
  app = undefined;
});

describe('SDK runtime compatibility (regression)', () => {
  it('parses a real Fastify success envelope through the SDK client', async () => {
    const result = await client.config.getPublic();

    expect(result.data.apiBaseUrl).toBe('/v1');
    expect(result.data.authMode).toBe('session');
    expect(result.meta.requestId).toMatch(/^req_/);
  });

  it('maps a real Fastify 404 into a sanitized SDK error', async () => {
    await expect(client.catalog.getById('missing-item')).rejects.toBeInstanceOf(NotFoundError);
  });
});
