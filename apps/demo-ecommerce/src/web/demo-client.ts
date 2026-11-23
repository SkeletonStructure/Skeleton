import type { DemoCart, DemoCheckoutResult } from './demo-client.generated.js';
import { DEMO_CART_PATHS } from './demo-client.generated.js';

export type { DemoCart, DemoCartLine, DemoCheckoutResult } from './demo-client.generated.js';

export interface DemoCartClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

export class DemoClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(options: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly requestId?: string;
  }) {
    super(options.message);
    this.name = 'DemoClientError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
  }
}

export interface DemoCartClient {
  setCsrfToken(token: string): void;
  get(): Promise<DemoCart>;
  setItem(itemId: string, quantity: number): Promise<DemoCart>;
  removeItem(itemId: string): Promise<DemoCart>;
  checkout(idempotencyKey: string): Promise<DemoCheckoutResult>;
}

interface Envelope<T> {
  readonly data: T;
  readonly meta: { readonly requestId: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Typed client for demo-local cart routes. Shared routes use the public SDK. */
export function createDemoCartClient(options: DemoCartClientOptions = {}): DemoCartClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let csrfToken: string | undefined;

  async function request<T>(
    method: 'GET' | 'PUT' | 'DELETE' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<T> {
    const requestHeaders: Record<string, string> = { accept: 'application/json', ...headers };
    if (body !== undefined) requestHeaders['content-type'] = 'application/json';
    if (method !== 'GET' && csrfToken !== undefined) {
      requestHeaders['x-csrf-token'] = csrfToken;
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      const requestId = response.headers.get('x-request-id') ?? undefined;
      throw new DemoClientError({
        status: response.status,
        code: typeof error.code === 'string' ? error.code : 'HTTP_ERROR',
        message: typeof error.message === 'string' ? error.message : 'The request failed.',
        ...(requestId === undefined ? {} : { requestId }),
      });
    }
    if (!isRecord(payload) || !('data' in payload)) {
      throw new DemoClientError({
        status: response.status,
        code: 'MALFORMED_RESPONSE',
        message: 'The demo API returned an unexpected response.',
      });
    }
    return (payload as unknown as Envelope<T>).data;
  }

  function itemPath(template: string, itemId: string): string {
    return template.replace('{itemId}', encodeURIComponent(itemId));
  }

  return {
    setCsrfToken(token) {
      csrfToken = token;
    },
    get: async () => request<DemoCart>('GET', DEMO_CART_PATHS.getCart),
    setItem: async (itemId, quantity) =>
      request<DemoCart>('PUT', itemPath(DEMO_CART_PATHS.setItem, itemId), { quantity }),
    removeItem: async (itemId) =>
      request<DemoCart>('DELETE', itemPath(DEMO_CART_PATHS.removeItem, itemId)),
    checkout: async (idempotencyKey) =>
      request<DemoCheckoutResult>('POST', DEMO_CART_PATHS.checkout, undefined, {
        'idempotency-key': idempotencyKey,
      }),
  };
}
