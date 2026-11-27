# Engineering principles

These are the conventions agents should preserve. They are derived from current code, manifests, tests, ADRs, and docs. When the repository has a concrete convention, follow it; when it does not, prefer the smallest change consistent with these principles.

## Code organization

- One pnpm workspace: `packages/*`, `apps/*`, `templates/*`, `examples/*`. The `templates/*` glob exists, but no `templates/` directory is present in the current tree.
- All packages and apps are private and version `0.1.0`. SkeletonStructure is source-distributed, not npm-published.
- `packages/core` owns infrastructure and must not import concrete modules or applications.
- `packages/module-*` own their schemas, migrations, permissions, routes, services, tests, and public APIs. They must not reach into another module's internals or demo code.
- `packages/app-composition` owns the checked-in M8 wiring and app-owned `additionalModules`; it is not a plugin discovery mechanism.
- `packages/sdk` is browser-safe, generated-type-driven, and free of runtime dependencies.
- Application-only domain code belongs in the app, e.g. `apps/demo-ecommerce/modules/cart`; do not promote it to `packages/` without an approved architectural change.

## Naming conventions

- Module IDs are explicit strings such as `users`, `auth`, `catalog`, `products`, `inventory`, `orders`, and app-local `cart`.
- Permission keys are namespaced: `users:read:self`, `catalog:write`, `orders:create`, `cart:checkout`, etc.
- Port IDs are versioned strings such as `buyer-context@1`, `price-resolver@1`, and `inventory@1`. Mirror port contracts without cross-importing module internals.
- Route declarations are relative paths; all business routes are served under `/v1`. Health routes are unprefixed and internal.
- Database table names are module-prefixed: core `core_*` (currently `core_audit_events`), `users_*`, `auth_*`, `catalog_items`, `commerce_products`, `inventory_items`, `orders_*`, and app-local `bookstore_*` or demo cart tables.
- Generated artifacts are generated, not hand-edited: `openapi/openapi.json`, `packages/sdk/generated/api.ts`, demo OpenAPI/client, and `docs/config/reference.md`.

## Type safety

- Strict TypeScript is configured in `tsconfig.base.json`, including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, and NodeNext modules.
- Prefer explicit domain types and public interfaces over `any`; generated files are the exception.
- Use `defineConfig()` and Zod-validated config rather than ad-hoc environment access in application code.
- Use `ModuleDefinition`, `ModuleContext`, and declared ports instead of informal injected objects.

## Error handling

- API errors use the fixed codes in `packages/core/src/api/errors.ts`: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`, `INTERNAL`.
- Success envelope: `{ data, meta: { requestId, nextCursor? } }`. Error envelope: `{ error: { code, message, details?, requestId } }`.
- Never leak stacks, SQL, config values, secrets, or internal exception text into responses.
- Map unknown failures to `500 INTERNAL`; preserve request IDs for supportability.
- The SDK mirrors API codes as typed error classes and sanitizes server-provided text. Do not make the shared SDK trust arbitrary server messages. Note that the demo-local client currently passes messages through; do not copy that behavior into the shared SDK.

## Logging and lifecycle

- Logging is configuration-driven: level, format, and redaction keys. Production requires JSON logs.
- Fastify's own logger stays disabled (`logger: false`). Core binds a request-scoped child `Logger` to the same `requestId` returned in `x-request-id`.
- Redact password, token, cookie, authorization, and `database.url`. Never log bodies, raw URLs, headers, reset links, tokens, or email content. A broken log transport must not alter a request result.
- Persistent audit logging is an unreleased M11 addition, not part of `v0.1.0`; it uses an append-only table and a validated core sink.
- Lifecycle state is explicit and monotonic. Shutdown drains readiness before one bounded close attempt and re-raises the original signal.

## Configuration management

- Precedence: process environment → `.env.local` → `.env` → `skeleton.config.ts` → defaults.
- Secrets come from `env(...)`, not literals. `database.url` is protected from literal values; `DATABASE_URL` and `SESSION_SECRET` are the secret env keys in the current model.
- Modules are disabled by default and activated explicitly under `config.modules`.
- Production validation requires secure cookies, JSON logs, CSRF enabled, exact CORS origins, and protected redaction defaults.
- Do not add a config field without updating the schema, config reference, docs, and drift checks.
- `SESSION_SECRET` is currently declared as a secret env key but has no consumed implementation; treat that as unresolved, not as an active requirement.

## Dependencies

- Keep the frozen lockfile authoritative: install with `pnpm install --frozen-lockfile`.
- New runtime dependencies require a concrete justification and review of licensing, browser compatibility, and bundle impact.
- SDK runtime dependencies are forbidden by contract test. Core depends only on infrastructure packages; modules depend on core and only the packages needed for declared relationships.
- Prefer existing Drizzle, Fastify, Zod, Argon2id, Vitest, Biome, and generated-artifact tooling.

## Reusability

- Check `packages/core`, existing modules, `app-composition`, scripts, and generated artifacts before writing new helpers.
- Use declared ports for optional capabilities; use `publicApi` for cross-module consumption.
- Use `additionalModules` for app-local static providers instead of modifying shared composition to discover application code.
- Keep app-local cart/menu/branches concerns and clients out of the public SDK.

## Backward compatibility

- Treat `v0.1.0` as the frozen baseline.
- `docs/compatibility/v0.1.0-operations.json` pins paths, operations, required fields, and response codes.
- `docs/compatibility/v0.1.0-allowlist.json` is a JSON array of operation keys (`/v1/path:method`, e.g. `/v1/orders:get`) or a bare path to permit removal of that path and its operations. It is currently empty. New operations are not treated as breaks; response body schemas are not frozen by the operation snapshot.
- `docs/compatibility/v0.1.0-migrations.json` pins SHA-256 hashes of the v0.1.0 migrations. Append new migrations; never rewrite old ones.
- Breaking API, SDK, config, or schema changes require a `Breaking` entry in `CHANGELOG.md`, release notes, and a version bump.

## Maintainability

- Keep changes small and scoped to one concern.
- Add or update tests with every bug fix and feature; bug fixes need a `*.regression.test.ts` under `tests/regression/` or the affected package's `tests/` unless explained.
- Do not weaken or delete existing tests.
- Prefer real Fastify/PostgreSQL behavior over mocks when infrastructure semantics matter.
- Update docs and this skill when behavior, status, or architectural constraints change; keep [current-state.md](current-state.md) and [feature-inventory.md](feature-inventory.md) synchronized, mark replaced decisions `Superseded`, and do not rewrite vision or roadmap without approval.
