# ADR 0008 — Replaceable rate-limit storage

- Date: 2026-11-27
- Status: accepted
- Milestone: M11

## Context

v0.1 used `@fastify/rate-limit` with its default per-process `LocalStore`. That is adequate for one process but silently under-counts when an application runs multiple instances. Code scanning also flagged the global hooks because the limiter was registered after them in `createServer`. A production hardening milestone needs an explicit storage choice, a shared option, and a failure policy that never turns off enforcement.

## Decision

Core owns one limiter registration and a small storage port (`RateLimitStoreProvider`). The default provider is an in-process map keyed by client address and route namespace; it remains the zero-configuration behavior and adds no dependency. Applications that need cross-instance limits inject an ioredis-compatible client through `createRedisRateLimitStore()` and set `security.rateLimit.store = 'redis'`. The adapter uses one atomic Lua `INCR`/`PEXPIRE` script; no Redis SDK is added to the foundation.

`security.rateLimit.failurePolicy` is explicitly `deny`. `@fastify/rate-limit` runs with `skipOnError: false`: when storage is unavailable the request is rejected and the standard `500 INTERNAL` envelope is returned. `/health/live` and `/health/ready` are exempt from limiting so readiness can report `RATE_LIMIT_STORE_UNAVAILABLE` through the injected store's health check. The plugin is registered before the CSRF and permission hooks, and route-level limits (including the stricter auth policies) continue to work through the plugin's `onRoute` hook.

The default `security.rateLimit.{enabled,max,windowMs}` values, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, the `429 RATE_LIMITED` envelope, and route-level limit declarations remain backward compatible.

## Alternatives considered

1. Keep the plugin's built-in Redis option: rejected because it requires `ioredis` as a dependency and would make Redis a default runtime concern.
2. Fall back to a local counter when shared storage fails: rejected because multi-instance protections would silently disappear during an outage.
3. Skip limiting on storage errors: rejected for the same reason; CodeQL's `js/missing-rate-limiting` warning describes exactly that class of gap.
4. Create a new module for rate limiting: rejected because infrastructure must stay in core and modules must not own shared HTTP infrastructure.

## Consequences

- Single-process applications need no new configuration, package, or service.
- Multi-process deployments must provide a shared client at composition time; startup fails closed if `store: 'redis'` has no matching provider.
- Storage outages produce errors and an unready health state instead of unmetered traffic.
- Health probes are not rate limited; other routes, including guarded routes, are.
- The previous ADR 0002 boundary is unchanged: core still owns the single Fastify instance and centralized enforcement.
