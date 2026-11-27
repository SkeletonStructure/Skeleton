# SkeletonStructure backend foundation

A self-hosted, MIT-licensed backend foundation built as a modular monolith. This repository is the engineering counterpart to the [SkeletonStructure website](https://skeletonstructure.github.io/); the website itself is maintained separately and is intentionally untouched by backend work.

## Status

v0.1.0 is the first usable release of the backend foundation. It includes M1–M8, the complete M9a e-commerce demonstration, and the M10 release documentation and verification work. M9b (the restaurant demonstration) is deliberately deferred and is not required for this release. The e-commerce demo is the primary demonstration application. Post-v0.1.0 M11 security and operational hardening is merged on `main` through PR #7 but has no separate release tag; see [`CHANGELOG.md`](./CHANGELOG.md) for its scope.

This is an early foundation, not a production-ready platform. It has no payments, MFA, CAPTCHA, per-account limits, real email adapter, or multi-tenancy. M11 adds provider-independent shared rate limiting and a persistent append-only audit log, but a Redis store must still be supplied explicitly by the application, and operators remain responsible for deployment hardening. Careful defaults lower risk, but they do not replace review, testing, and updates. See [`SECURITY.md`](./SECURITY.md), [`docs/security/checklist.md`](./docs/security/checklist.md), and [`docs/releases/v0.1.0.md`](./docs/releases/v0.1.0.md) for explicit limitations.

## Quick start

Requirements: Node.js 22 or newer, pnpm 10, and PostgreSQL 16. Docker is the simplest way to provide PostgreSQL locally:

```bash
docker run --name skeleton-pg \
  -e POSTGRES_USER=skeleton \
  -e POSTGRES_PASSWORD=skeleton \
  -e POSTGRES_DB=skeleton \
  -p 5432:5432 -d postgres:16-alpine
```

The command uses development-only credentials. Stop the container with `docker stop skeleton-pg` and remove it with `docker rm skeleton-pg` when finished.

From a fresh clone, install, configure, migrate, and start the composed backend:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
cp skeleton.config.example.ts skeleton.config.ts
pnpm db:migrate
pnpm start
```

The checked-in config example enables `users`, `auth`, `catalog`, `products`, `inventory`, and `orders`. Check health in another terminal:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

For an actual deployment, use a least-privilege database role, set `NODE_ENV=production`, `COOKIE_SECURE=true`, `DATABASE_SSL=true`, and an exact `CORS_ORIGINS` allowlist. Operator responsibilities are listed in [`SECURITY.md`](./SECURITY.md).

To run the M9a e-commerce demo, follow [`apps/demo-ecommerce/README.md`](./apps/demo-ecommerce/README.md). In short, set its `DATABASE_URL`, then run `pnpm demo:ecommerce:migrate`, `pnpm demo:ecommerce:seed`, `pnpm demo:ecommerce:api`, and `pnpm demo:ecommerce:dev`. The seeded login and verification commands are documented there and in [`docs/m9.md`](./docs/m9.md).

## Scripts

| Script                   | Command                                                              | Purpose                                                   |
| ------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `typecheck`              | `tsc -b --pretty false`                                              | Type-check all TypeScript projects                        |
| `lint`                   | `biome check .`                                                      | Format check and lint                                     |
| `format`                 | `biome format --write .`                                             | Apply formatting                                          |
| `test`                   | `vitest run`                                                         | Run all unit, integration, contract, and regression tests |
| `test:unit`              | `vitest run --config vitest.unit.config.ts`                          | Run fast tests that need no infrastructure                |
| `test:integration`       | `vitest run --config vitest.integration.config.ts`                   | Run all Fastify/PostgreSQL container tests                |
| `test:contract`          | `vitest run --config vitest.contract.config.ts`                      | Run SDK and module contract tests                         |
| `test:regression`        | `vitest run --config vitest.regression.config.ts`                    | Run explicit regression tests                             |
| `test:migration-smoke`   | `pnpm test:migration-smoke`                                          | Run the real migration CLI against a temporary database   |
| `test:watch`             | `vitest`                                                             | Run tests in watch mode                                   |
| `demo:ecommerce:migrate` | `pnpm --filter @skeletonstructure/demo-ecommerce db:migrate`         | Apply shared plus demo-cart migrations                    |
| `demo:ecommerce:seed`    | `pnpm --filter @skeletonstructure/demo-ecommerce db:seed`            | Seed the demo user and products                           |
| `demo:ecommerce:api`     | `pnpm --filter @skeletonstructure/demo-ecommerce api`                | Start the demo API                                        |
| `demo:ecommerce:dev`     | `pnpm --filter @skeletonstructure/demo-ecommerce dev`                | Start the demo storefront                                 |
| `demo:ecommerce:verify`  | OpenAPI/client checks, integration tests, and Playwright happy path  | Verify the complete e-commerce demo                       |
| `sdk:generate`           | `node scripts/generate-sdk.mjs`                                      | Regenerate SDK types from OpenAPI                         |
| `sdk:check`              | `node scripts/check-sdk.mjs`                                         | Verify committed SDK types are current                    |
| `config:docs`            | `tsc -b packages/core && node scripts/generate-config-reference.mjs` | Regenerate the config reference                           |
| `db:generate`            | `drizzle-kit generate --config drizzle.config.ts`                    | Generate a reviewed core migration                        |
| `db:generate:users`      | `drizzle-kit generate --config drizzle.users.config.ts`              | Generate a reviewed users migration                       |
| `db:generate:auth`       | `drizzle-kit generate --config drizzle.auth.config.ts`               | Generate a reviewed auth migration                        |
| `db:generate:catalog`    | `drizzle-kit generate --config drizzle.catalog.config.ts`            | Generate a reviewed catalog migration                     |
| `db:generate:products`   | `drizzle-kit generate --config drizzle.products.config.ts`           | Generate a reviewed products migration                    |
| `db:generate:inventory`  | `drizzle-kit generate --config drizzle.inventory.config.ts`          | Generate a reviewed inventory migration                   |
| `db:generate:orders`     | `drizzle-kit generate --config drizzle.orders.config.ts`             | Generate a reviewed orders migration                      |
| `db:migrate`             | `tsc -b && node scripts/migrate-modules.mjs`                         | Apply all M1–M8 migrations in order                       |
| `start`                  | `tsc -b && node scripts/skeleton.mjs start`                          | Start the composed M8 server                              |
| `skeleton`               | `node scripts/skeleton.mjs`                                          | Run `db migrate` or `start`                               |
| `auth:cleanup`           | `tsc -b && node scripts/cleanup-sessions.mjs`                        | Remove expired sessions and reset tokens                  |
| `openapi:generate`       | `tsc -b && node scripts/generate-openapi.mjs`                        | Regenerate the public OpenAPI file                        |
| `openapi:check`          | `tsc -b && node scripts/check-openapi.mjs`                           | Verify the committed OpenAPI file                         |
| `ci`                     | `pnpm run ci`                                                        | Shorter local gate; CI runs every listed check            |

CI runs on pull requests and pushes to `main`. The workflow jobs are `verify` and `demo-ecommerce-e2e`; see [`docs/quality-assurance.md`](./docs/quality-assurance.md) for the complete gate list and recorded CodeQL triage, and verify current alert state on GitHub.

## Configuration

SkeletonStructure uses a checked-in `skeleton.config.ts` for non-secret settings and environment variables for secrets and deployment overrides. Copy [`skeleton.config.example.ts`](./skeleton.config.example.ts) as a starting point.

```ts
import { defineConfig, env, envInt } from '@skeletonstructure/core/config';

export default defineConfig({
  app: { name: 'My app', url: env('APP_URL', 'http://localhost:3000') },
  server: { port: envInt('PORT', 3000) },
  database: { url: env('DATABASE_URL') },
});
```

Precedence, highest first:

1. Process environment variables
2. `.env.local`
3. `.env`
4. `skeleton.config.ts`
5. Built-in defaults

Secret fields must be supplied with `env(...)`. Literal secrets in the config file fail validation. Invalid configuration throws `ConfigError` with all issues in one message, before the application starts.

Optional modules are off unless `config.modules[id].enabled` is `true`, and dependent modules must be enabled together. The example config enables the supported v0.1.0 graph; [`docs/modules.md`](./docs/modules.md) and [`docs/m8.md`](./docs/m8.md) document dependencies, ports, and activation order. The frontend SDK is distributed as a private workspace package in v0.1.0; it is not published to npm. Integrate it from this repository as shown in [`docs/sdk.md`](./docs/sdk.md) and the `examples/` directory.

The full generated field list is in [`docs/config/reference.md`](./docs/config/reference.md). Regenerate it with `pnpm config:docs`.

## Database

The core package owns a single PostgreSQL pool and Drizzle instance. Applications initialize it once at startup and close it on shutdown; modules use `getDatabase()` and never create their own connections.

```ts
import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, initializeDatabase } from '@skeletonstructure/core/database';

const config = await loadConfig();
await initializeDatabase(config.database);

try {
  // Start application work.
} finally {
  await closeDatabase();
}
```

Migrations are explicit and module-owned: use the matching `pnpm db:generate:*` script to create reviewed SQL. `pnpm db:migrate` applies core/users/auth, then catalog, products, inventory, and orders migrations in dependency order. The original v0.1.0 baseline remains byte-for-byte pinned; M11 appends a core migration for the `core_audit_events` table. The M9a demo adds one app-local cart migration through `pnpm demo:ecommerce:migrate`; it does not change the shared migration runner. See [`docs/database.md`](./docs/database.md) for lifecycle, transactions, health semantics, migration workflow, and limitations.

## Modules

Optional modules are static, explicitly composed, and disabled unless enabled under `config.modules`. The registry validates definitions and dependencies, activates enabled modules in dependency order, and returns a redacted activation report. Core never imports a module, and modules receive only a controlled context containing config, the shared database, permission/route registrars, and declared dependency APIs.

```ts
import { composeModuleRegistry } from '@skeletonstructure/core/modules';

const registry = composeModuleRegistry({
  appConfig: config,
  modules: [usersModule, catalogModule],
});

const report = await registry.activate();
```

Module route and permission declarations are validated before HTTP startup. M5 wires declared routes into Fastify; M6 supplies `users` and `auth`; M8 adds `catalog`, `products`, `inventory`, and `orders`, with `@skeletonstructure/app-composition` providing the explicit static wiring and startup ambiguity checks. M9a demonstrates app-local extension: the e-commerce cart is defined under `apps/demo-ecommerce/` and added through `additionalModules` without changing shared packages. See [`docs/modules.md`](./docs/modules.md), [`docs/m8.md`](./docs/m8.md), and [`docs/m9.md`](./docs/m9.md) for the full contract, lifecycle, and failure modes.

## API

The M5 API adapter builds one Fastify instance with a `/v1` prefix, request IDs, the standard JSON envelope, validation/error mapping, permission hooks, exact-origin CORS, shared-capable rate limiting, health endpoints, public config, and OpenAPI generation.

```ts
import { createServer } from '@skeletonstructure/core/api';
import { composeModuleRegistry } from '@skeletonstructure/core/modules';

const registry = composeModuleRegistry({ appConfig: config, database, modules: [] });
const report = await registry.activate();
const app = await createServer({ appConfig: config, activationReport: report, database });
await app.listen({ host: config.server.host, port: config.server.port });
```

`GET /health/live` checks only process responsiveness. `GET /health/ready` returns `503` with a short reason code when config, database, migration, or injected readiness checks fail. `GET /v1/config/public` exposes only the frontend-safe allowlist.

M6 implements sessions, login, CSRF, roles/permissions, and password reset behind that boundary. Protected routes still deny by default unless an injected authenticator supplies a principal; disabled modules register no routes rather than making them public. M8 adds catalog CRUD with validated expansion, separate product and inventory routes, and authenticated orders with idempotency and immutable snapshots. M7's SDK now covers catalog/products/inventory/orders namespaces derived from the committed OpenAPI artifact. M9a adds demo-local cart routes with a separate OpenAPI artifact and typed client; checkout stops at order confirmation and captures no payment. See [`docs/api.md`](./docs/api.md), [`docs/auth.md`](./docs/auth.md), [`docs/sdk.md`](./docs/sdk.md), [`docs/m8.md`](./docs/m8.md), and [`docs/m9.md`](./docs/m9.md).

## Operational hardening

M11, merged on `main` after `v0.1.0`, adds four foundation-owned capabilities without changing the public route contract:

- **Shared rate limiting:** `security.rateLimit.store` selects an in-memory default or an optional Redis provider. Redis requires an application-injected ioredis-compatible client; no Redis dependency is added and storage errors fail closed.
- **Persistent audit events:** auth, authorization, CSRF, rate-limit, and role-assignment events are written to the append-only `core_audit_events` table through a core-owned sink. Identity-changing events share the domain transaction.
- **Structured logging:** `createLogger()` implements the validated level/format/redaction settings, binds `requestId` to each request, and never logs bodies, raw URLs, headers, or credentials.
- **Graceful shutdown:** `createLifecycle()` and `createShutdownCoordinator()` flip readiness to draining, close HTTP/providers/database once within a bounded timeout, and re-raise the original signal.

See [`docs/api.md`](./docs/api.md), [`docs/database.md`](./docs/database.md), [`docs/security/checklist.md`](./docs/security/checklist.md), and ADRs 0008–0012 in [`docs/architecture/adr/`](./docs/architecture/adr/) for boundaries and residual risks.

## Layout

```text
packages/core/         mandatory core infrastructure: config, database, modules, API, security, logging, lifecycle
packages/module-users/ optional user identity, profiles, roles, and permissions
packages/module-auth/  optional sessions, login, CSRF, and password reset
packages/module-catalog/   optional generic catalog and provider contracts
packages/module-products/  optional product extension and price resolver
packages/module-inventory/ optional stock tracking and reservation port
packages/module-orders/    optional authenticated orders and snapshots
packages/app-composition/  non-domain static M8 wiring and migration runner
packages/sdk/          OpenAPI-derived browser-safe client and typed errors
examples/              frontend-vanilla and frontend-react SDK examples
apps/                  demonstration applications (M9a: demo-ecommerce with an app-local cart)
templates/           starter application template
docs/config/         generated configuration reference
docs/database.md     database infrastructure guide
docs/modules.md      module contract and registry guide
docs/api.md          HTTP adapter, errors, health, CORS, and OpenAPI
docs/architecture/   architecture records and ADRs
openapi/             committed public OpenAPI artifact
.env.example         documented environment variables
skeleton.config.example.ts  example typed config
```

## Documentation

- `CONTRIBUTING.md` — contribution workflow.
- `SECURITY.md` — private vulnerability reporting and limitations.
- `docs/config/reference.md` — every configuration field, default, and env var.
- `docs/database.md` — database lifecycle, usage, migrations, and health checks.
- `docs/modules.md` — module contract, composition, lifecycle, and activation report.
- `docs/api.md` — server composition, error model, permission hook, health, CORS, rate limits, and OpenAPI.
- `docs/auth.md` — authentication, sessions, CSRF, password reset, authorization model, and cleanup.
- `docs/sdk.md` — SDK initialization, auth/CSRF behavior, typed errors, and current limitations.
- `docs/m8.md` — M8 module graph, routes, schemas, ports, order semantics, and limitations.
- `docs/m9.md` — M9a e-commerce demo, reused modules, demo-local cart, payment seam, and verification.
- `docs/architecture/adr/` — architecture decision records.
- `AGENTS.md` — agent navigation and mandatory session workflow.
- `.agents/skills/skeletonstructure-engineering/SKILL.md` — portable engineering skill for coding agents; read before substantial foundation work.
- `.agents/skills/skeletonstructure-engineering/references/current-state.md` — dated implementation status snapshot.
- `.agents/skills/skeletonstructure-engineering/references/feature-inventory.md` — quick map of implemented, partial, deferred, and absent capabilities.

The engineering blueprint was the authoritative bootstrap design intent in the `SkeletonStructure-blueprint` workspace; it has not been imported into `docs/architecture/`. Current accepted decisions live in [`docs/architecture/adr/`](./docs/architecture/adr/).
