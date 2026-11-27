# API infrastructure

M5 added the HTTP adapter around the existing M2 config, M3 database, and M4 module registry. M6 keeps that adapter unchanged in purpose and supplies the optional `users` and `auth` modules that implement sessions, login, CSRF, and authorization. M11 hardening, included in `v0.2.0`, adds replaceable rate-limit storage, persistent audit events, structured request logs, and explicit lifecycle/readiness state. It still exposes only core HTTP infrastructure; module behavior lives in module packages.

## Composition

```ts
import { createM8Composition } from '@skeletonstructure/app-composition';
import { createServer } from '@skeletonstructure/core/api';
import { loadConfig } from '@skeletonstructure/core/config';
import { createDatabaseAuditSink, initializeDatabase } from '@skeletonstructure/core/database';
import { createLifecycle } from '@skeletonstructure/core/lifecycle';
import { createLogger } from '@skeletonstructure/core/logging';

const appConfig = await loadConfig();
const logger = createLogger(appConfig.logging);
const lifecycle = createLifecycle();
const database = await initializeDatabase(appConfig.database);
const auditSink = createDatabaseAuditSink(database);

const composition = await createM8Composition({ appConfig, database, audit: auditSink });

const app = await createServer({
  appConfig,
  activationReport: composition.activationReport,
  database,
  routeHandlers: composition.routeHandlers,
  authenticator: composition.authenticator,
  csrfGuard: composition.csrfGuard,
  auditSink,
  logger,
  lifecycle,
});

await app.listen({ host: appConfig.server.host, port: appConfig.server.port });
lifecycle.markReady();
```

`createServer()` validates configuration, CORS, rate limits, activation report shape, route permissions, route handlers, injected provider ids, and readiness checks before returning the Fastify instance. Invalid startup input fails closed with `ApiConfigurationError`. `logger`, `lifecycle`, `auditSink`, and `rateLimitStore` are optional injection points; omitting them preserves the v0.1.0 composition behavior.

For new applications, prefer `startApplication()` from `@skeletonstructure/app-composition`. It performs the same startup sequence above, passes an explicit composition context to an injected composer, installs shutdown coordination, and returns the Fastify instance alongside config, composition, logger, lifecycle, and an idempotent `close()` method. The basic-app template supplies `migrationFolders`; existing root and demo scripts use the helper without adding a migration check.

## Request and response model

- All public routes are under `/v1`.
- Every request receives an opaque `x-request-id` response header, `requestId` on the request, and a request-scoped child `logger` bound to the same ID. Structured completion and error logs contain method, route template, status, duration, and error code only.
- Success responses use the envelope:

```json
{ "data": { "ok": true }, "meta": { "requestId": "req_..." } }
```

- Validation failures return `400 VALIDATION_ERROR` with a stable code, safe message, request ID, and up to 20 field details.
- Unexpected errors return `500 INTERNAL` with a generic message and request ID. Stack traces, SQL, file paths, config values, and secrets are never sent to clients.

## Auth and permission hook

An injected `Authenticator` resolves a request principal. M6's `auth` module provides one backed by opaque database sessions:

```ts
await createServer({
  appConfig,
  activationReport,
  database,
  authenticator: composition.authenticator,
  csrfGuard: composition.csrfGuard,
});
```

Routes with a declared permission are guarded globally before the handler runs. Routes marked `requireAuth: true` require a principal but no permission key. Missing or invalid authentication returns `401 UNAUTHENTICATED`; an authenticated principal without the permission returns `403 FORBIDDEN`. Routes that declare an unknown permission cause startup to fail.

The optional `csrfGuard` is applied globally to unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) before the permission guard. It only challenges requests that present the session cookie; bearer-authenticated clients are not subject to the cookie CSRF check. See [`auth.md`](./auth.md) for the full session, CSRF, and authorization model.

## CORS and rate limiting

CORS uses the existing M2 `security.cors` config. Origins must be exact `http(s)` origins. Wildcard origins are rejected, including when credentials are disabled. When no origins are configured, cross-origin headers are not emitted.

Rate limiting uses `security.rateLimit`. The zero-configuration `memory` store remains per-process and retains at most 5,000 keys with least-recently-used eviction; setting `store: 'redis'` requires an application to inject `createRedisRateLimitStore({ client })` with its own ioredis-compatible client. No Redis dependency is added. The plugin is registered before CSRF and permission hooks with `skipOnError: false`, so storage failures return the standard `500 INTERNAL` envelope rather than allowing unmetered traffic; breaches return `429 RATE_LIMITED` and may be recorded as `security.rate_limit` audit failures. Auth and password-reset routes still declare a stricter per-route limit (10 requests per minute). `/health/live` and `/health/ready` are exempt from limiting.

## Health endpoints

- `GET /health/live` returns `200 { "status": "ok" }` when the process is responsive. It performs no dependency checks.
- `GET /health/ready` returns `200` only when core readiness checks pass: config shape, database health, injected checks such as migration state, and (when supplied) explicit `lifecycle`, rate-limit store, and audit sink checks. Failure returns `503` with a short reason code such as `SERVICE_DRAINING`, `RATE_LIMIT_STORE_UNAVAILABLE`, or `AUDIT_STORE_UNAVAILABLE`, plus a request ID; it never exposes credentials, exception text, or host details.

Migration state is injected as a `ReadinessCheck`; M5 does not create a new migration-status API. Applications may use `createMigrationReadinessCheck()` with explicit folders or supply their own check; startup does not add one by default. A pending or unreadable migration state returns only `MIGRATIONS_PENDING`. The reserved check IDs are `config`, `database`, `rateLimitStore`, `audit`, and `lifecycle`; the migration check arrives through its own `createServer()` option.

## Public config

`GET /v1/config/public` returns only the frontend-safe allowlist:

```json
{
  "data": {
    "appName": "SkeletonStructure",
    "apiBaseUrl": "/v1",
    "authMode": "session",
    "publicModules": ["users", "auth"]
  },
  "meta": { "requestId": "req_..." }
}
```

Secrets, database details, internal versions, file paths, and provider configuration are excluded.

## OpenAPI

The committed artifact for shared routes is `openapi/openapi.json`. It is generated from the real Fastify route registrations by `pnpm openapi:generate` and checked in CI by `pnpm openapi:check`. Routes tagged `internal` are excluded, so health endpoints do not appear in the public contract.

Demo-local routes must not be added to that shared artifact. M9a generates a separate `apps/demo-ecommerce/openapi/demo-openapi.json` from the demo's real route registrations and checks it with `pnpm demo:ecommerce:openapi:check`. The same demo composition supplies a generated typed client for its cart routes; shared routes remain the public SDK's responsibility.

## Logging and lifecycle

`createLogger(appConfig.logging)` emits JSON or pretty lines with level filtering and recursive redaction of password, token, cookie, authorization, and `databaseUrl` values. Messages are stable event names such as `http.request_completed`; arbitrary text is replaced with `log.invalid_message` before emission. Applications inject the logger into `createServer()`; core adds the request ID binding and logs only safe, bounded fields. Fastify's own logger remains disabled. Applications may supply any compatible `Logger`, but must preserve the redaction guarantee.

`createLifecycle()` exposes `starting → ready → draining → closed`. `createShutdownCoordinator()` flips readiness to draining before the application's explicit close callback, bounds cleanup with a default 10-second timeout, and re-raises the original `SIGINT`/`SIGTERM` after cleanup. The shipped start scripts mark ready only after `listen()` succeeds.

## Deferred

M6 added real authentication, sessions, CSRF enforcement, and authorization data. M7 added an OpenAPI-derived `fetch` client; M8 adds catalog, product, inventory, and order routes to that contract. M9a adds app-local cart routes and a separate demo contract, but no payment capture. M11 adds a durable audit table and a shared limiter seam, but still adds no Redis dependency, per-account limiter, CAPTCHA, or MFA. See [`m8.md`](./m8.md) for shared domain routes, [`m9.md`](./m9.md) for the demo and payment seam, and [`sdk.md`](./sdk.md) for the client boundary.
