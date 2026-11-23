# `@skeletonstructure/app-composition`

Non-domain application wiring for M8. This package is not a module and is never discovered at runtime; it is the explicit place where the application selects modules and resolves their ports.

## Exports

- `createM8Composition()` — builds users, auth, catalog, products, inventory, and orders; resolves ports; filters routes to the activation report; and returns the authenticator and CSRF guard.
- `assertSinglePriceResolver()` — fails with `AMBIGUOUS_PRICE_RESOLVER` before activation/listen when more than one active provider exists. The message names all providers and the application name.
- `runM8Migrations()` — applies M1–M8 migrations in dependency order.
- `AMBIGUOUS_PRICE_RESOLVER` and `CompositionError` — stable startup failure contract.

`additionalModules` accepts application-owned static module definitions so a second price resolver can be detected without adding runtime discovery.

## Usage

`scripts/start-server.mjs`, `pnpm start`, `pnpm skeleton db migrate`, and `scripts/migrate-modules.mjs` use this package. See [`docs/m8.md`](../../docs/m8.md).
