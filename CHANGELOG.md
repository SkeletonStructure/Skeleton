# Changelog

All notable changes are recorded here. The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

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

### Changed

- Core gained only generic cursor support (`CursorPage`, `pageResult`, `isCursorPage`) and optional `meta.nextCursor`; no domain types were added to core.
- Server startup and migration scripts now use the M8 composition boundary instead of M6-only wiring.
- Root scripts, Vitest project config, Biome ignores, and CI now include M9a demo artifact checks and the real-browser e-commerce job; the public OpenAPI and SDK contracts remain unchanged.
