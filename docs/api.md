# API infrastructure

M5 added the HTTP adapter around the existing M2 config, M3 database, and M4 module registry. M6 keeps that adapter unchanged in purpose and supplies the optional `users` and `auth` modules that implement sessions, login, CSRF, and authorization. It still exposes only core HTTP infrastructure; module behavior lives in module packages.

## Composition

```ts
import { loadConfig } from '@skeletonstructure/core/config';
import { initializeDatabase } from '@skeletonstructure/core/database';
import { createServer } from '@skeletonstructure/core/api';
import { createAuthUsersComposition } from '@skeletonstructure/module-auth';

const appConfig = await loadConfig();
const database = await initializeDatabase(appConfig.database);

const composition = await createAuthUsersComposition({ appConfig, database });

const app = await createServer({
  appConfig,
  activationReport: composition.activationReport,
  database,
  routeHandlers: composition.routeHandlers,
  authenticator: composition.authenticator,
  csrfGuard: composition.csrfGuard,
});

await app.listen({ host: appConfig.server.host, port: appConfig.server.port });
```

`createServer()` validates configuration, CORS, rate limits, activation report shape, route permissions, route handlers, and readiness checks before returning the Fastify instance. Invalid startup input fails closed with `ApiConfigurationError`.

## Request and response model

- All public routes are under `/v1`.
- Every request receives an opaque `x-request-id` response header and `requestId` on the request.
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

Rate limiting uses `security.rateLimit` and is per-process in v0.1. Auth and password-reset routes declare a stricter per-route limit (10 requests per minute). Multi-instance deployments need a shared limiter before production scale. Limit breaches return `429 RATE_LIMITED` with the standard error envelope.

## Health endpoints

- `GET /health/live` returns `200 { "status": "ok" }` when the process is responsive. It performs no dependency checks.
- `GET /health/ready` returns `200` only when core readiness checks pass: config shape, database health, and any injected readiness checks such as migration state. Failure returns `503` with a short reason code and request ID, never credentials or host details.

Migration state is injected as a `ReadinessCheck`; M5 does not create a new migration-status API.

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

The committed artifact is `openapi/openapi.json`. It is generated from the real Fastify route registrations by `pnpm openapi:generate` and checked in CI by `pnpm openapi:check`. Routes tagged `internal` are excluded, so health endpoints do not appear in the public contract.

## Deferred

M6 added real authentication, sessions, CSRF enforcement, and authorization data. M7 added an OpenAPI-derived `fetch` client for these public routes; M8+ add application modules and domain routes. The adapter still does not add durable rate limiting or a Redis dependency. See [`sdk.md`](./sdk.md) for the client boundary.
