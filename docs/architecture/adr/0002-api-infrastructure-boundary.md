# ADR 0002 — Minimal API infrastructure boundary

- Date: 2026-11-23
- Status: accepted
- Milestone: M5

## Context

M4 produces a validated activation report containing permission declarations and route metadata, but no HTTP process. M5 must add Fastify, validation/error mapping, permission hooks, CORS, rate limiting, health endpoints, public config, and an OpenAPI artifact without introducing application modules or implementing authentication.

## Decision

Core owns one Fastify instance created by `createServer()`. The M2 application config configures CORS, rate limiting, and trust-proxy behavior. The M3 `Database` interface supplies readiness health only. The M4 activation report supplies permission and route declarations; every declared route must have an injected handler before startup succeeds. A root-level request hook assigns opaque request IDs, and a root-level permission hook enforces declared permissions so encapsulated module plugins cannot bypass it. Migration and future module health checks are injected as `ReadinessCheck` values. Public config is a fixed allowlist. The committed OpenAPI artifact is generated from registered public routes and checked in CI.

Authentication is represented only by the `Authenticator` interface. Without an injected authenticator, protected routes are denied. Real sessions, CSRF, roles, and permission grants remain M6 concerns.

## Alternatives considered

1. Let each module create its own Fastify plugin with independent hooks: rejected because global guarantees could be bypassed.
2. Implement session authentication in M5: rejected because it is explicitly M6 scope and would require database tables and domain modules.
3. Hand-write the OpenAPI document: rejected because it would drift from registered routes.

## Consequences

- Startup fails closed on wildcard CORS, invalid rate limits, unknown route permissions, undeclared or missing handlers, and duplicate readiness check ids.
- The error contract is stable and secret-free: `VALIDATION_ERROR`, authz codes, `RATE_LIMITED`, and generic `INTERNAL`.
- The OpenAPI artifact currently contains only `/v1/config/public`; module routes will appear only when applications add handlers in later milestones.
- Per-process rate limiting is insufficient for multi-instance production deployments and is documented as a v0.1 limitation.

## Verification

Unit tests cover error mapping, readiness decisions, public-config redaction, and startup validation. Fastify `inject` integration tests cover validation errors, unknown permission startup failure, unexpected-error redaction, health behavior, CORS, permission guards, rate limiting, success envelopes, public config, and OpenAPI generation. CI runs Node 24, type-check, lint, OpenAPI freshness, all tests, and a high-level dependency audit.
