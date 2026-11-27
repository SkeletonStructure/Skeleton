# Changelog

All notable changes are recorded here. The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- M11.1 governance evidence for rulesets, CodeQL alerts, secret scanning, and the latest `main` CI failure; the eight pre-existing Biome formatting errors on `main` are fixed in this branch.
- M11.2 provider-independent shared rate limiting: core `RateLimitStoreProvider` port, default in-memory store, optional injected ioredis-compatible adapter, explicit `security.rateLimit.store`, and fail-closed `skipOnError: false` enforcement before authorization/CSRF hooks.
- M11.3 persistent append-only audit events: `core_audit_events` table, database triggers, validated core sink, transaction-aware auth/users events, readiness check, and ADRs for audit logging and integrity.
- M11.4 dependency-free structured logging with JSON/pretty formats, configured redaction, request correlation, explicit lifecycle states, a bounded graceful-shutdown coordinator, and ADRs 0011–0012.
- M11.5 regression coverage for redaction, level filtering, request correlation, failed rate-limit storage, failed audit writes, named readiness failures, lifecycle transitions, and shutdown timeout behavior.

### Changed

- Rate limits can now be shared across instances when an application injects the Redis provider; the zero-configuration in-memory behavior and all existing configuration defaults remain unchanged.
- Startup scripts now create the configured logger, mark readiness only after `listen()`, drain readiness before closing resources, and re-raise the original termination signal.
- Skill, architecture, security, API, database, QA, and current-state documentation reflects the post-v0.1.0 implementation without rewriting the tagged release record.

### Fixed

- Logout session revocation and its audit row now share one transaction, so an audit failure cannot leave an unrecorded revocation.
- Log messages are restricted to stable event names; arbitrary text, including embedded credentials, is replaced with `log.invalid_message`.
- Rate-limit and audit close hooks are attempted independently, so one failure cannot skip the other.
- Audit timestamps are always server-generated; callers can no longer supply `occurredAt`.
- An audit failure while recording a `429` now returns a safe `500 INTERNAL` envelope instead of letting Fastify expose raw exception text.
- The default memory limiter is capped at 5,000 keys with least-recently-used eviction, matching the bounded behavior of the previous Fastify store.

### Security

- Shared limiter storage errors no longer permit unmetered requests, audit writes no longer fail silently, and readiness reports `RATE_LIMIT_STORE_UNAVAILABLE`, `AUDIT_STORE_UNAVAILABLE`, or lifecycle reasons instead of generic success.
- No CodeQL alert was dismissed, no repository setting was changed, and no CI result is claimed from this local branch.

## [0.1.0] - 2026-11-24

### Added

- M1 monorepo foundation: pnpm workspaces, strict TypeScript configuration, Biome, Vitest, and CI.
- MIT license, README, security policy, contribution guide, code of conduct, and ADR template.
- M2 core configuration: typed `defineConfig`, environment loading with precedence, Zod validation, aggregated errors, secret handling, redacted startup summary, sample config, `.env.example`, and generated config reference.
- M3 database infrastructure: shared PostgreSQL pool and Drizzle instance, verified initialization, duplicate-init prevention, graceful shutdown, transactions, safe health checks, advisory-locked migrations, Drizzle Kit workflow, and Testcontainers integration coverage.
- M4 module registry: explicit `ModuleDefinition`, static composition, config-driven enable/disable, dependency and port validation, deterministic topological activation, circular/missing dependency detection, scoped permission and in-memory route registration, controlled module context, redacted activation report, unit tests, and architecture/module documentation.
- M5 API infrastructure: Fastify adapter with `/v1` prefix, request IDs, JSON success/error envelopes, validation mapping, global permission guard, exact-origin CORS, per-process rate limiting, liveness/readiness, frontend-safe public config, committed OpenAPI artifact and CI freshness check, unit/integration tests, and API documentation.
- M6 authentication and authorization: `users` and `auth` modules with module-owned migrations, Argon2id password hashing, opaque SHA-256-hashed database sessions, rotating httpOnly cookies, CSRF guard, roles/permissions with explicit ownership checks, generic rate-limited auth errors, single-use expiring password reset with a redacting console email adapter, session cleanup job, security/authz integration tests, and updated OpenAPI/documentation.
- M7 frontend SDK: OpenAPI-derived TypeScript types committed under `packages/sdk/generated`, deterministic `sdk:generate`/`sdk:check` scripts, thin `fetch` client with cookie/bearer auth and in-memory CSRF rotation, typed errors for all public error codes, vanilla and React compile-checked examples, contract/security tests, documentation, ADR, and CI coverage. Catalog/orders SDK methods are deferred until real M8 API contracts exist.
- M8 first business modules: generic `catalog` CRUD with validated expansion and cursor pagination; separate `products`, `inventory`, and `orders` packages with module-owned PostgreSQL schemas and migrations; generic `PriceResolverPort`, `InventoryPort`, and `BuyerContextPort` wiring; server-side price authority; immutable order-line snapshots; transactional idempotency with duplicate-result and concurrency handling; user-only buyers and ownership checks; optional inventory reservation with oversell rejection; a non-domain `app-composition` package that fails startup with `AMBIGUOUS_PRICE_RESOLVER` before listen; refreshed OpenAPI and SDK namespaces; unit/integration/contract tests for all four modules; module READMEs, `docs/m8.md`, and ADRs 0005/0006.
- M9a complete e-commerce demo: Vite/vanilla TypeScript storefront, separate API, app-local cart module and migration, seeded user/products, server-authoritative cart pricing, authenticated and isolated cart routes, explicit checkout success/cleanup-failure semantics with idempotent retry, order-history view, demo-specific OpenAPI and generated client with drift checks, PostgreSQL migration/authz/checkout integration tests, Playwright browser happy path, `docs/m9.md`, app README, and ADR 0007. No shared core/module contract was changed and no payment was implemented.
- M10 initial release preparation: Docker PostgreSQL quick start, complete module READMEs, source-only SDK distribution guidance, threat model and security checklist, release checklist, `SECURITY.md` fallback contact and limitations, v0.1.0 release notes, version alignment, and final verification evidence.

### Changed

- Core gained only generic cursor support (`CursorPage`, `pageResult`, `isCursorPage`) and optional `meta.nextCursor`; no domain types were added to core.
- Server startup and migration scripts now use the M8 composition boundary instead of M6-only wiring.
- Root scripts, Vitest project config, Biome ignores, and CI now include M9a demo artifact checks and the real-browser e-commerce job; the public OpenAPI and SDK contracts remain unchanged.

### Known limitations

- M9b restaurant demonstration is deferred; the e-commerce demo is the only v0.1.0 demonstration application.
- No payments, guest checkout, MFA, real email adapter, persistent audit logging, shared rate limiter, multi-tenancy, or additional database engines are included.
- v0.1.0 is not claimed to be completely secure or production-ready beyond the tested scope. See [`docs/releases/v0.1.0.md`](./docs/releases/v0.1.0.md).
