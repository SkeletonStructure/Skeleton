import type { RouteOptions } from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  createMemoryRateLimitStore,
  createRedisRateLimitStore,
  type RateLimitResult,
  type RateLimitStore,
  REDIS_INCREMENT_SCRIPT,
  type RedisEvalClient,
} from '../../src/api/index.js';

type RouteInfoOptions = RouteOptions & { path: string; prefix: string };

function route(method: string, url: string): RouteInfoOptions {
  return { method, url, routeInfo: { method, url } } as unknown as RouteInfoOptions;
}

function increment(
  store: RateLimitStore,
  key: string,
  timeWindow = 60_000,
  max = 10,
): Promise<RateLimitResult> {
  return new Promise((resolve, reject) => {
    store.incr(
      key,
      (error, result) => (error === null && result !== undefined ? resolve(result) : reject(error)),
      timeWindow,
      max,
    );
  });
}

describe('rate-limit storage providers', () => {
  it('counts requests in the default in-memory store and expires windows', async () => {
    let now = 1_000;
    const provider = createMemoryRateLimitStore({ now: () => now });
    const store = provider.createStore();

    expect((await increment(store, 'client', 5)).current).toBe(1);
    expect((await increment(store, 'client', 5)).current).toBe(2);
    now += 10;
    expect((await increment(store, 'client', 5)).current).toBe(1);
    await provider.close?.();
    expect((await increment(provider.createStore(), 'client', 60_000)).current).toBe(1);
  });

  it('bounds the default store by evicting the least recently used key', async () => {
    const provider = createMemoryRateLimitStore({ maxEntries: 2 });
    const store = provider.createStore();

    expect((await increment(store, 'a', 60_000)).current).toBe(1);
    expect((await increment(store, 'b', 60_000)).current).toBe(1);
    expect((await increment(store, 'a', 60_000)).current).toBe(2);
    expect((await increment(store, 'c', 60_000)).current).toBe(1);
    expect((await increment(store, 'a', 60_000)).current).toBe(3);
    expect((await increment(store, 'b', 60_000)).current).toBe(1);
  });

  it('isolates per-route budgets even for the same client key', async () => {
    const provider = createMemoryRateLimitStore();
    const store = provider.createStore();
    const login = store.child(route('POST', '/v1/auth/login'));
    const logout = store.child(route('POST', '/v1/auth/logout'));

    expect((await increment(store, 'client')).current).toBe(1);
    expect((await increment(login, 'client')).current).toBe(1);
    expect((await increment(login, 'client')).current).toBe(2);
    expect((await increment(logout, 'client')).current).toBe(1);
  });

  it('uses an atomic Lua increment with the configured key prefix', async () => {
    const calls: unknown[][] = [];
    const values = new Map<string, { current: number; expiresAt: number }>();
    const client: RedisEvalClient = {
      async eval(script, numKeys, ...args) {
        calls.push([script, numKeys, ...args]);
        if (script !== REDIS_INCREMENT_SCRIPT) return 1;
        const key = String(args[0]);
        const window = Number(args[1]);
        const now = Date.now();
        const existing = values.get(key);
        const current =
          existing === undefined || existing.expiresAt <= now ? 1 : existing.current + 1;
        const expiresAt =
          existing === undefined || existing.expiresAt <= now ? now + window : existing.expiresAt;
        values.set(key, { current, expiresAt });
        return [current, expiresAt - now];
      },
    };
    const provider = createRedisRateLimitStore({ client, keyPrefix: 'app:limit:' });
    const store = provider.createStore().child(route('POST', '/v1/auth/login'));

    expect((await increment(store, 'client', 60_000)).current).toBe(1);
    expect((await increment(store, 'client', 60_000)).current).toBe(2);
    expect(calls[0]).toEqual([
      REDIS_INCREMENT_SCRIPT,
      1,
      'app:limit:POST:/v1/auth/login:client',
      60_000,
    ]);
    expect(await provider.health()).toEqual({ status: 'ok' });
    await provider.close?.();
    expect(await provider.health()).toEqual({
      status: 'error',
      reason: 'RATE_LIMIT_STORE_UNAVAILABLE',
    });
  });

  it('reports unhealthy storage and propagates storage failures without skipping limits', async () => {
    const client: RedisEvalClient = {
      async eval() {
        throw new Error('connection refused');
      },
    };
    const provider = createRedisRateLimitStore({ client });
    expect(await provider.health()).toEqual({
      status: 'error',
      reason: 'RATE_LIMIT_STORE_UNAVAILABLE',
    });
    await expect(increment(provider.createStore(), 'client')).rejects.toThrow('connection refused');
  });
});
