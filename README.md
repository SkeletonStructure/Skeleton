# SkeletonStructure backend foundation

A self-hosted, MIT-licensed backend foundation built as a modular monolith. This repository is the engineering counterpart to the [SkeletonStructure website](https://skeletonstructure.github.io/); the website itself is maintained separately and is intentionally untouched by backend work.

## Status

- Milestone M5 — API infrastructure and module registry.
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

## Scripts

| Script             | Command                                                              | Purpose                            |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------- |
| `typecheck`        | `tsc -b --pretty false`                                              | Type-check all TypeScript projects |
| `lint`             | `biome check .`                                                      | Format check and lint              |
| `format`           | `biome format --write .`                                             | Apply formatting                   |
| `test`             | `vitest run`                                                         | Run all unit and integration tests |
| `test:integration` | `vitest run packages/core/tests/database/integration.test.ts`        | Run the PostgreSQL container test  |
| `test:watch`       | `vitest`                                                             | Run tests in watch mode            |
| `config:docs`      | `tsc -b packages/core && node scripts/generate-config-reference.mjs` | Regenerate the config reference    |
| `db:generate`      | `drizzle-kit generate --config drizzle.config.ts`                    | Generate a reviewed SQL migration  |
| `db:migrate`       | `tsc -b packages/core && node scripts/skeleton.mjs db migrate`       | Apply migrations explicitly        |
| `openapi:generate` | `tsc -b packages/core && node scripts/generate-openapi.mjs`          | Regenerate the public OpenAPI file |
| `openapi:check`    | `tsc -b packages/core && node scripts/check-openapi.mjs`             | Verify the committed OpenAPI file  |
| `ci`               | `pnpm typecheck && pnpm lint && pnpm test`                           | Full local verification            |

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

Migrations are explicit: use `pnpm db:generate` to create reviewed SQL and `pnpm db:migrate` to apply it. The baseline migration contains no application tables. See [`docs/database.md`](./docs/database.md) for lifecycle, transactions, health semantics, migration workflow, and limitations.

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

Module route and permission declarations are validated before HTTP startup. M5 wires declared routes into Fastify; application modules still arrive in later milestones. See [`docs/modules.md`](./docs/modules.md) for the full contract, lifecycle, and failure modes.

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

M5 defines the authentication boundary but does not implement sessions or login. Protected routes deny by default unless an injected authenticator supplies a principal with the declared permission; real authentication and authorization are M6. See [`docs/api.md`](./docs/api.md) for envelopes, error codes, CORS, health, and OpenAPI details.

## Layout

```text
packages/core/       mandatory core infrastructure: config, database, modules, API
apps/                demonstration applications (added in M9)
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
- `docs/architecture/adr/` — architecture decision records.

The authoritative engineering blueprint lives in the `SkeletonStructure-blueprint` workspace during bootstrap and will be imported into `docs/architecture/` as the repository matures.
