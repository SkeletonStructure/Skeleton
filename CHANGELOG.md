# Changelog

All notable changes are recorded here. The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- M1 monorepo foundation: pnpm workspaces, strict TypeScript configuration, Biome, Vitest, and CI.
- MIT license, README, security policy, contribution guide, code of conduct, and ADR template.
- M2 core configuration: typed `defineConfig`, environment loading with precedence, Zod validation, aggregated errors, secret handling, redacted startup summary, sample config, `.env.example`, and generated config reference.
- M3 database infrastructure: shared PostgreSQL pool and Drizzle instance, verified initialization, duplicate-init prevention, graceful shutdown, transactions, safe health checks, advisory-locked migrations, Drizzle Kit workflow, and Testcontainers integration coverage.
