import type { RouteOptions } from 'fastify';

import type { HealthResult } from './types.js';

/**
 * Storage port for the shared limiter. The shape matches the custom-store
 * contract of `@fastify/rate-limit`; no Redis client is required by default.
 */
export interface RateLimitResult {
  readonly current: number;
  readonly ttl: number;
}

export type RateLimitCallback = (error: Error | null, result?: RateLimitResult) => void;

export interface RateLimitStore {
  incr(key: string, callback: RateLimitCallback, timeWindow: number, max: number): void;
  child(routeOptions: RouteOptions & { path: string; prefix: string }): RateLimitStore;
}

export interface RateLimitStoreProvider {
  /** Must match `security.rateLimit.store` from the application config. */
  readonly id: string;
  createStore(): RateLimitStore;
  health(): Promise<HealthResult>;
  /** Called when the Fastify instance closes; providers must be idempotent. */
  close?(): Promise<void>;
}

interface RateLimitBackend {
  increment(key: string, timeWindow: number, max: number): Promise<RateLimitResult>;
}

function routePrefix(routeOptions: RouteOptions & { path: string; prefix: string }): string {
  const info = (
    routeOptions as RouteOptions & {
      routeInfo?: { readonly method?: unknown; readonly url?: unknown };
    }
  ).routeInfo;
  if (info === undefined) return '';
  const method = typeof info.method === 'string' ? info.method : '';
  const url = typeof info.url === 'string' ? info.url : '';
  return `${method}:${url}:`;
}

/** Namespaces keys so a per-route policy cannot consume a different route's budget. */
class PrefixedRateLimitStore implements RateLimitStore {
  constructor(
    private readonly backend: RateLimitBackend,
    private readonly prefix: string,
  ) {}

  incr(key: string, callback: RateLimitCallback, timeWindow: number, max: number): void {
    this.backend.increment(`${this.prefix}${key}`, timeWindow, max).then(
      (result) => callback(null, result),
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error('Rate-limit store operation failed.')),
    );
  }

  child(routeOptions: RouteOptions & { path: string; prefix: string }): RateLimitStore {
    return new PrefixedRateLimitStore(this.backend, `${this.prefix}${routePrefix(routeOptions)}`);
  }
}

const DEFAULT_MEMORY_STORE_MAX_ENTRIES = 5_000;

class MemoryRateLimitBackend implements RateLimitBackend {
  private readonly entries = new Map<string, { current: number; expiresAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries: number = DEFAULT_MEMORY_STORE_MAX_ENTRIES,
  ) {}

  async increment(key: string, timeWindow: number): Promise<RateLimitResult> {
    const now = this.now();
    const existing = this.entries.get(key);
    if (existing !== undefined && existing.expiresAt > now) {
      const current = existing.current + 1;
      this.entries.delete(key);
      this.entries.set(key, { current, expiresAt: existing.expiresAt });
      return { current, ttl: Math.max(0, existing.expiresAt - now) };
    }
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { current: 1, expiresAt: now + timeWindow });
    return { current: 1, ttl: timeWindow };
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface MemoryRateLimitStoreOptions {
  /** Injectable clock for deterministic window-expiry tests. */
  readonly now?: () => number;
  /** Maximum distinct keys retained per process; defaults to 5,000. */
  readonly maxEntries?: number;
}

/** Default provider: one shared, LRU-bounded map inside each process. */
export function createMemoryRateLimitStore(
  options: MemoryRateLimitStoreOptions = {},
): RateLimitStoreProvider {
  const maxEntries =
    options.maxEntries !== undefined && Number.isFinite(options.maxEntries)
      ? Math.max(1, Math.floor(options.maxEntries))
      : DEFAULT_MEMORY_STORE_MAX_ENTRIES;
  const backend = new MemoryRateLimitBackend(options.now, maxEntries);
  let closed = false;
  return {
    id: 'memory',
    createStore: () => new PrefixedRateLimitStore(backend, ''),
    health: async () => ({ status: 'ok' }),
    close: async () => {
      if (!closed) {
        closed = true;
        backend.clear();
      }
    },
  };
}

/**
 * Minimal ioredis-compatible surface. No Redis dependency is added to the
 * foundation; applications that need shared limits inject their own client.
 */
export interface RedisEvalClient {
  eval(script: string, numKeys: number, ...args: readonly (string | number)[]): Promise<unknown>;
}

export interface RedisRateLimitStoreOptions {
  readonly client: RedisEvalClient;
  readonly keyPrefix?: string;
}

export const REDIS_INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`.trim();

function parseRedisResult(value: unknown): RateLimitResult {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Rate-limit store returned an invalid response.');
  }
  const current = Number(value[0]);
  const ttl = Number(value[1]);
  if (!Number.isFinite(current) || current < 1 || !Number.isFinite(ttl) || ttl < 0) {
    throw new Error('Rate-limit store returned an invalid response.');
  }
  return { current, ttl };
}

/** Optional shared provider. The application owns the client lifecycle. */
export function createRedisRateLimitStore(
  options: RedisRateLimitStoreOptions,
): RateLimitStoreProvider {
  const keyPrefix = options.keyPrefix ?? 'skel:ratelimit:';
  let closed = false;

  const backend: RateLimitBackend = {
    async increment(key, timeWindow) {
      if (closed) throw new Error('Rate-limit store is closed.');
      const reply = await options.client.eval(
        REDIS_INCREMENT_SCRIPT,
        1,
        `${keyPrefix}${key}`,
        timeWindow,
      );
      return parseRedisResult(reply);
    },
  };

  return {
    id: 'redis',
    createStore: () => new PrefixedRateLimitStore(backend, ''),
    health: async () => {
      if (closed) return { status: 'error', reason: 'RATE_LIMIT_STORE_UNAVAILABLE' };
      try {
        const reply = await options.client.eval('return 1', 0);
        return Number(reply) === 1
          ? { status: 'ok' }
          : { status: 'error', reason: 'RATE_LIMIT_STORE_UNAVAILABLE' };
      } catch {
        return { status: 'error', reason: 'RATE_LIMIT_STORE_UNAVAILABLE' };
      }
    },
    close: async () => {
      closed = true;
    },
  };
}

/** Adapts a provider to the plugin's custom-store constructor contract. */
export function rateLimitStoreConstructor(
  provider: RateLimitStoreProvider,
): new (
  options: unknown,
) => RateLimitStore {
  return class ConfiguredRateLimitStore implements RateLimitStore {
    private readonly store: RateLimitStore;

    constructor(_options: unknown) {
      this.store = provider.createStore();
    }

    incr(key: string, callback: RateLimitCallback, timeWindow: number, max: number): void {
      this.store.incr(key, callback, timeWindow, max);
    }

    child(routeOptions: RouteOptions & { path: string; prefix: string }): RateLimitStore {
      return this.store.child(routeOptions);
    }
  };
}
