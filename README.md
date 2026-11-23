# SkeletonStructure backend foundation

A self-hosted, MIT-licensed backend foundation built as a modular monolith. This repository is the engineering counterpart to the [SkeletonStructure website](https://skeletonstructure.github.io/); the website itself is maintained separately and is intentionally untouched by backend work.

## Status

- Milestone M9a — complete e-commerce demonstration on top of the M8 business modules.
- M9b (restaurant demonstration), security review, and release verification are not started.
- No production-readiness claim. Security review and release verification happen in milestone M10.

## Quick start

Requirements: Node.js 22 or newer and pnpm 10.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm typecheck
pnpm lint
pnpm test
```

To run the M9a e-commerce demo, follow [`apps/demo-ecommerce/README.md`](./apps/demo-ecommerce/README.md). In short, set its `DATABASE_URL`, then run `pnpm demo:ecommerce:migrate`, `pnpm demo:ecommerce:seed`, `pnpm demo:ecommerce:api`, and `pnpm demo:ecommerce:dev`. The seeded login and verification commands are documented there and in [`docs/m9.md`](./docs/m9.md).

## Scripts

| Script                   | Command                                                              | Purpose                                  |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------------------- |
| `typecheck`              | `tsc -b --pretty false`                                              | Type-check all TypeScript projects       |
| `lint`                   | `biome check .`                                                      | Format check and lint                    |
| `format`                 | `biome format --write .`                                             | Apply formatting                         |
| `test`                   | `vitest run`                                                         | Run all unit and integration tests       |
| `test:contract`          | `vitest run packages/sdk/tests/contract.test.ts`                     | Run SDK boundary/contract tests          |
| `test:integration`       | `vitest run packages/core/tests/database/integration.test.ts`        | Run the core PostgreSQL container test   |
| `test:watch`             | `vitest`                                                             | Run tests in watch mode                  |
| `demo:ecommerce:migrate` | `pnpm --filter @skeletonstructure/demo-ecommerce db:migrate`         | Apply shared plus demo-cart migrations   |
| `demo:ecommerce:seed`    | `pnpm --filter @skeletonstructure/demo-ecommerce db:seed`            | Seed the demo user and products          |
| `demo:ecommerce:api`     | `pnpm --filter @skeletonstructure/demo-ecommerce api`                | Start the demo API                       |
| `demo:ecommerce:dev`     | `pnpm --filter @skeletonstructure/demo-ecommerce dev`                | Start the demo storefront                |
| `demo:ecommerce:verify`  | OpenAPI/client checks, integration tests, and Playwright happy path  | Verify the complete e-commerce demo      |
| `sdk:generate`           | `node scripts/generate-sdk.mjs`                                      | Regenerate SDK types from OpenAPI        |
| `sdk:check`              | `node scripts/check-sdk.mjs`                                         | Verify committed SDK types are current   |
| `config:docs`            | `tsc -b packages/core && node scripts/generate-config-reference.mjs` | Regenerate the config reference          |
| `db:generate`            | `drizzle-kit generate --config drizzle.config.ts`                    | Generate a reviewed core migration       |
| `db:generate:users`      | `drizzle-kit generate --config drizzle.users.config.ts`              | Generate a reviewed users migration      |
| `db:generate:auth`       | `drizzle-kit generate --config drizzle.auth.config.ts`               | Generate a reviewed auth migration       |
| `db:generate:catalog`    | `drizzle-kit generate --config drizzle.catalog.config.ts`            | Generate a reviewed catalog migration    |
| `db:generate:products`   | `drizzle-kit generate --config drizzle.products.config.ts`           | Generate a reviewed products migration   |
| `db:generate:inventory`  | `drizzle-kit generate --config drizzle.inventory.config.ts`          | Generate a reviewed inventory migration  |
| `db:generate:orders`     | `drizzle-kit generate --config drizzle.orders.config.ts`             | Generate a reviewed orders migration     |
| `db:migrate`             | `tsc -b && node scripts/migrate-modules.mjs`                         | Apply all M1–M8 migrations in order      |
| `start`                  | `tsc -b && node scripts/skeleton.mjs start`                          | Start the composed M8 server             |
| `skeleton`               | `node scripts/skeleton.mjs`                                          | Run `db migrate` or `start`              |
| `auth:cleanup`           | `tsc -b && node scripts/cleanup-sessions.mjs`                        | Remove expired sessions and reset tokens |
| `openapi:generate`       | `tsc -b && node scripts/generate-openapi.mjs`                        | Regenerate the public OpenAPI file       |
| `openapi:check`          | `tsc -b && node scripts/check-openapi.mjs`                           | Verify the committed OpenAPI file        |
| `ci`                     | `pnpm typecheck && pnpm lint && pnpm test`                           | Local type, lint, and test gate          |

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

Migrations are explicit and module-owned: use the matching `pnpm db:generate:*` script to create reviewed SQL. `pnpm db:migrate` applies core/users/auth, then catalog, products, inventory, and orders migrations in dependency order. The baseline migration contains no application tables. The M9a demo adds one app-local cart migration through `pnpm demo:ecommerce:migrate`; it does not change the shared migration runner. See [`docs/database.md`](./docs/database.md) for lifecycle, transactions, health semantics, migration workflow, and limitations.

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

The M5 API adapter builds one Fastify instance with a `/v1` prefix, request IDs, the standard JSON envelope, validation/error mapping, permission hooks, exact-origin CORS, per-process rate limiting, health endpoints, public config, and OpenAPI generation.

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

## Layout

```text
packages/core/         mandatory core infrastructure: config, database, modules, API, security
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

The authoritative engineering blueprint lives in the `SkeletonStructure-blueprint` workspace during bootstrap and will be imported into `docs/architecture/` as the repository matures.
