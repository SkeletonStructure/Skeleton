# ADR 0004 — OpenAPI-derived thin frontend SDK

- Date: 2026-11-23
- Status: accepted
- Milestone: M7

## Context

M5 produces a committed public OpenAPI artifact from real Fastify routes, and M6 supplies authenticated auth/users endpoints. Frontend applications need typed access to those endpoints without importing server code, database configuration, environment variables, or secrets. The blueprint rejects full client generators and hand-written APIs that drift from the server contract.

## Decision

`packages/sdk` contains generated TypeScript types and a small hand-written `fetch` wrapper. A deterministic local generator reads `openapi/openapi.json` and emits `packages/sdk/generated/api.ts`; `pnpm sdk:generate` writes it and `pnpm sdk:check` fails if it is stale. No generator runtime dependency is added.

The client exposes only `config`, `auth`, and `users` namespaces for endpoints that exist in the committed contract. It supports cookie sessions with `credentials: 'include'`, in-memory CSRF token capture and rotation, and bearer credentials supplied by a caller callback. Cookie mutations send the configured CSRF header only when a token is available; bearer requests use `Authorization` and do not send cookie CSRF headers.

All public API error codes map to typed `SkeletonError` subclasses. Errors carry only fixed safe messages, status, sanitized request ID, and optional sanitized validation details. Raw response bodies, stack traces, SQL, config, and tokens are never exposed. A throwing `onError` hook cannot mask the sanitized error. The SDK performs no retries and has no persistent token storage.

Vanilla and React examples consume only the SDK and use safe DOM/React rendering. They compile under the repository's strict TypeScript settings.

## Alternatives considered

1. Full OpenAPI client generator: rejected because it produces a large generated surface and runtime dependencies.
2. Fully hand-written SDK types: rejected because they drift from the route schemas.
3. Importing server API types directly: rejected because server packages pull Fastify/Drizzle/config code into browser builds and violate package boundaries.
4. Adding speculative catalog/orders methods before M8: rejected because it would invent endpoint paths and schemas.

## Consequences

- The generated file is committed and must be regenerated with any public API change; CI enforces freshness.
- Only operations present in the committed artifact are typed. Catalog/products/orders/inventory methods arrive when their M8 contracts exist.
- Typed errors use fixed safe messages rather than echoing arbitrary server text.
- Browser clients remain dependent on exact-origin CORS configuration for cross-origin cookie sessions.

## Verification

Contract tests check generated alias coverage, SDK/examples boundary rules, and absence of server imports, environment access, and unsafe DOM APIs. Unit tests with injected `fetch` cover request construction, CSRF capture/rotation, bearer behavior, all eight error-code mappings, malformed responses, and network failures. CI runs SDK generation freshness, contract tests, typechecking of SDK and examples, lint, and the full test suite on Node 24.
