import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  createSkeletonClient,
  IdempotencyError,
  InternalError,
  NotFoundError,
  RateLimitError,
  type SkeletonError,
  ValidationError,
} from '../src/index.js';

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function headersOf(calls: readonly FetchCall[], index: number): Record<string, string> {
  return (calls[index]?.init.headers ?? {}) as Record<string, string>;
}

function envelope(data: unknown, requestId = 'req_test'): unknown {
  return { data, meta: { requestId } };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_header' },
  });
}

function captureFetch(responses: readonly (Response | Error)[]) {
  const calls: FetchCall[] = [];
  let index = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses[index];
    index += 1;
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error('No queued response.');
    return response;
  };
  return { calls, fetchImpl };
}

describe('createSkeletonClient', () => {
  it('calls the public config endpoint with cookie credentials', async () => {
    const { calls, fetchImpl } = captureFetch([jsonResponse(200, envelope({ appName: 'Test' }))]);
    const client = createSkeletonClient({ baseUrl: '/v1/', fetch: fetchImpl });

    const response = await client.config.getPublic();

    expect(response.data).toEqual({ appName: 'Test' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/v1/config/public');
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.credentials).toBe('include');
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('tracks in-memory CSRF tokens and rotates after getCurrentUser', async () => {
    const { calls, fetchImpl } = captureFetch([
      jsonResponse(200, envelope({ csrfToken: 'csrf-1' })),
      jsonResponse(200, envelope({ csrfToken: 'csrf-2' })),
      jsonResponse(200, envelope({ csrfToken: 'csrf-3', roles: [], permissions: [] })),
      jsonResponse(200, envelope({})),
      jsonResponse(200, envelope({ id: 'user-1' })),
    ]);
    const client = createSkeletonClient({ fetch: fetchImpl });

    await client.auth.register({ email: 'one@example.com', password: 'password-123' });
    await client.auth.login({ email: 'one@example.com', password: 'password-123' });
    await client.auth.getCurrentUser();
    await client.auth.logout();
    await client.users.updateMe({ displayName: 'New name' });

    expect(headersOf(calls, 0)['x-csrf-token']).toBeUndefined();
    expect(headersOf(calls, 1)['x-csrf-token']).toBe('csrf-1');
    expect(headersOf(calls, 2)['x-csrf-token']).toBeUndefined();
    expect(headersOf(calls, 3)['x-csrf-token']).toBe('csrf-3');
    expect(headersOf(calls, 4)['x-csrf-token']).toBe('csrf-3');
    expect(calls[4]?.init.body).toBe(JSON.stringify({ displayName: 'New name' }));
  });

  it('uses bearer authentication without cookie CSRF headers', async () => {
    const { calls, fetchImpl } = captureFetch([
      jsonResponse(200, envelope({ csrfToken: 'csrf-1' })),
      jsonResponse(200, envelope({})),
    ]);
    const client = createSkeletonClient({
      fetch: fetchImpl,
      bearerToken: async () => 'bearer-value',
    });

    await client.auth.register({ email: 'two@example.com', password: 'password-123' });
    await client.auth.logout();

    const logoutHeaders = headersOf(calls, 1);
    expect(logoutHeaders.authorization).toBe('Bearer bearer-value');
    expect(logoutHeaders['x-csrf-token']).toBeUndefined();
  });

  it('maps every public error code to the matching typed error', async () => {
    const cases = [
      ['VALIDATION_ERROR', 400, ValidationError],
      ['UNAUTHENTICATED', 401, AuthenticationError],
      ['FORBIDDEN', 403, AuthorizationError],
      ['NOT_FOUND', 404, NotFoundError],
      ['CONFLICT', 409, ConflictError],
      ['IDEMPOTENCY_CONFLICT', 409, IdempotencyError],
      ['RATE_LIMITED', 429, RateLimitError],
      ['INTERNAL', 500, InternalError],
    ] as const;

    for (const [code, status, Expected] of cases) {
      const { fetchImpl } = captureFetch([
        jsonResponse(status, {
          error: {
            code,
            message: 'SQL SELECT * FROM secrets',
            requestId: 'req_error',
            details: [{ path: 'email', message: 'Invalid.' }],
          },
        }),
      ]);
      const reported: SkeletonError[] = [];
      const client = createSkeletonClient({
        fetch: fetchImpl,
        onError: (error) => reported.push(error),
      });

      let caught: unknown;
      try {
        await client.config.getPublic();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Expected);
      const sdkError = caught as SkeletonError;
      expect(sdkError.code).toBe(code);
      expect(sdkError.status).toBe(status);
      expect(sdkError.requestId).toBe('req_error');
      expect(sdkError.message).not.toContain('SQL');
      expect(JSON.stringify(sdkError)).not.toContain('secrets');
      expect(reported).toEqual([sdkError]);
    }
  });

  it('maps malformed errors by status and keeps messages sanitized', async () => {
    const { fetchImpl } = captureFetch([
      new Response('token=leaked', {
        status: 401,
        headers: { 'x-request-id': 'req_header' },
      }),
      new Response('token=leaked', {
        status: 401,
        headers: { 'x-request-id': 'req_header' },
      }),
    ]);
    const client = createSkeletonClient({ fetch: fetchImpl });

    await expect(client.config.getPublic()).rejects.toBeInstanceOf(AuthenticationError);
    await expect(client.config.getPublic()).rejects.toMatchObject({
      message: 'Authentication is required.',
      requestId: 'req_header',
    });
  });

  it('maps network failures to a safe internal error', async () => {
    const reported: SkeletonError[] = [];
    const { fetchImpl } = captureFetch([new Error('secret bearer token')]);
    const client = createSkeletonClient({
      fetch: fetchImpl,
      onError: (error) => reported.push(error),
    });

    let caught: unknown;
    try {
      await client.config.getPublic();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InternalError);
    expect((caught as Error).message).toBe('Network request failed.');
    expect(JSON.stringify(caught)).not.toContain('secret');
    expect(reported).toHaveLength(1);
  });

  it('does not retry authentication or rate-limit failures', async () => {
    const cases = [
      [401, 'UNAUTHENTICATED', AuthenticationError],
      [429, 'RATE_LIMITED', RateLimitError],
    ] as const;

    for (const [status, code, Expected] of cases) {
      const { calls, fetchImpl } = captureFetch([
        jsonResponse(status, {
          error: { code, message: 'ignored', requestId: 'req_error' },
        }),
        jsonResponse(200, envelope({})),
      ]);
      const reported: SkeletonError[] = [];
      const client = createSkeletonClient({
        fetch: fetchImpl,
        onError: (error) => reported.push(error),
      });

      await expect(client.config.getPublic()).rejects.toBeInstanceOf(Expected);
      expect(calls).toHaveLength(1);
      expect(reported).toHaveLength(1);
    }
  });

  it('does not let a throwing onError hook mask sanitized errors', async () => {
    const { fetchImpl } = captureFetch([
      new Response('token=leaked', {
        status: 500,
        headers: { 'x-request-id': 'req_header' },
      }),
    ]);
    const client = createSkeletonClient({
      fetch: fetchImpl,
      onError: () => {
        throw new Error('logging secret');
      },
    });

    let caught: unknown;
    try {
      await client.config.getPublic();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InternalError);
    expect((caught as Error).message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(caught)).not.toContain('secret');
  });

  it('rejects malformed success responses without exposing the body', async () => {
    const { fetchImpl } = captureFetch([new Response('secret=body', { status: 200 })]);
    const client = createSkeletonClient({ fetch: fetchImpl });

    let caught: unknown;
    try {
      await client.config.getPublic();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InternalError);
    expect((caught as Error).message).toBe('Malformed API response.');
    expect(JSON.stringify(caught)).not.toContain('secret');
  });
});
