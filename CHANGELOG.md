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
