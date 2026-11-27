# ADR 0013 — Reusable application runtime and opt-in migration readiness

- Date: 2026-11-27
- Status: accepted
- Milestone: M12

## Context

M11 supplied the individual startup seams: validated configuration, a structured
logger, explicit lifecycle and shutdown coordination, one shared database, a
database audit sink, static composition, one Fastify server, and a readiness
check seam. Applications still repeated the same ordered startup and migration
CLI wiring in their scripts. The workspace and README also advertised a
`templates/*` starter, but no template existed.

A new application should be able to adopt the foundation without changing
`packages/`. It also needs a safe way to surface pending migrations without
auto-migrating on startup, leaking SQL or paths through readiness, or changing
the frozen public API and config schema.

## Decision

1. `@skeletonstructure/app-composition` exports `startApplication()`, which
   performs the established order: load config, create logger and lifecycle,
   initialize the database, create the audit sink, call an injected composer,
   create the server, install the shutdown coordinator, listen, then mark
   ready. It returns the Fastify instance plus config, composition, logger,
   lifecycle, and an idempotent `close()` method. Optional composer inputs,
   readiness checks, rate-limit store, audit sink, and migration check remain
   injectable.
2. The same package exports `runApplicationMigrations()` for the shared CLI
   sequence: load config, initialize the database, call an explicit migration
   runner, close the database, and report the applied count. Root and demo
   scripts adopt both helpers without changing their CLI commands.
3. `templates/basic-app` is a minimal workspace application that composes the
   shared M8 graph and adds no shared domain code, table, or migration. It owns
   its config, scripts, and integration test.
4. `@skeletonstructure/core/database` exports an additive
   `createMigrationReadinessCheck()` and `readExpectedMigrationHashes()`. The
   check derives the expected Drizzle SHA-256 migration hashes from explicitly
   supplied journal/SQL folders, compares them with
   `drizzle.__drizzle_migrations`, and returns only the fixed reason
   `MIGRATIONS_PENDING` when a migration is absent or the query fails. It is
   opt-in through `migrationFolders` or an application-supplied
   `migrationCheck`; default startup behavior is unchanged.
5. No shared migration, config field, public route, SDK artifact, OpenAPI
   operation, or runtime dependency is added.

## Alternatives considered

1. **Keep copying startup scripts into each application.** Rejected: the
   sequence is already stable and duplicated code risks drift in lifecycle or
   error cleanup.
2. **Auto-migrate during startup.** Rejected: migrations remain explicit
   operator actions and old migration files are hash-pinned.
3. **Let core import concrete modules and discover migration folders.**
   Rejected: core must not depend on modules, and explicit lists remain the
   established boundary.
4. **Expose raw migration errors or paths in readiness.** Rejected: health
   output must stay free of SQL, credentials, hostnames, and internal paths.
5. **Add a config schema field for migration folders.** Rejected: folders are
   code-level composition inputs, not validated deployment configuration.

## Consequences

- New applications can start from one helper and keep domain code, modules,
  migrations, and deployment in the application.
- Migration readiness is a hash-based preflight, not a proof of schema
  semantics. Applications must list every folder their migration runner
  applies; a missing or invalid folder fails startup before listen.
- Custom migration runners must still record hashes through Drizzle's
  `drizzle.__drizzle_migrations` table for the check to recognize them.
- Existing root and demo startup behavior is preserved; only the starter
  template enables the migration check.
- The template is a foundation example, not a production deployment manifest.

## Verification

Unit tests cover expected-hash derivation, applied/pending/error outcomes, and
safe reason strings. Integration tests cover the check before and after a real
migration run, starter health and public config with readiness enabled, and
database cleanup after a composition failure. The full gate also runs
typecheck, lint, contract/regression layers, artifact drift checks, migration
smoke, demo verification/build, config-reference drift, and dependency audit.
