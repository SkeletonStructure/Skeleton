# `@skeletonstructure/app-composition`

Non-domain application wiring for M8. This package is not a module and is never discovered at runtime; it is the explicit place where the application selects modules and resolves their ports.

## Exports

- `createM8Composition()` — builds users, auth, catalog, products, inventory, and orders; resolves ports; filters routes to the activation report; and returns the authenticator and CSRF guard.
- `assertSinglePriceResolver()` — fails with `AMBIGUOUS_PRICE_RESOLVER` before activation/listen when more than one active provider exists. The message names all providers and the application name.
- `runM8Migrations()` — applies M1–M8 migrations in dependency order.
- `m8MigrationFolders()` — returns the explicit shared migration folders in migration order for opt-in readiness checks.
- `startApplication()` — shared startup sequence for config, logger, lifecycle, database, audit, composition, server, shutdown, listen, and ready.
- `runApplicationMigrations()` — shared migration CLI sequence for config, database, explicit runner, and close.
- `AMBIGUOUS_PRICE_RESOLVER` and `CompositionError` — stable startup failure contract.

`additionalModules` accepts application-owned static module definitions so a second price resolver can be detected without adding runtime discovery.

## Usage

`scripts/start-server.mjs`, `pnpm start`, `pnpm skeleton db migrate`, `scripts/migrate-modules.mjs`, the e-commerce demo scripts, and `templates/basic-app` use this package. Migration readiness is opt-in; the starter passes `migrationFolders` explicitly. See [`docs/m8.md`](../../docs/m8.md) and [ADR 0013](../../docs/architecture/adr/0013-application-runtime-and-migration-readiness.md).
