# Database infrastructure

SkeletonStructure uses one PostgreSQL database and one shared connection pool. The core package owns that pool and the Drizzle instance; modules and application code receive the shared `Database` interface and must not create their own pools.

PostgreSQL is the only supported database in v0.1. This is a deliberate narrow port, not a promise of database portability.

## Configuration

Database settings come from the M2 configuration system:

```ts
import { defineConfig, env, envBool, envInt } from '@skeletonstructure/core/config';

export default defineConfig({
  database: {
    url: env('DATABASE_URL'),
    ssl: envBool('DATABASE_SSL', false),
    pool: {
      max: envInt('DB_POOL_MAX', 10),
      idleTimeoutMs: envInt('DB_POOL_IDLE_TIMEOUT_MS', 300_000),
      connectTimeoutMs: envInt('DB_POOL_CONNECT_TIMEOUT_MS', 10_000),
    },
  },
});
```

`DATABASE_URL` is a required secret and can only be supplied through the environment. Pool defaults are a maximum of 10 connections, a five-minute idle timeout, and a ten-second connect timeout. When `DATABASE_SSL=true`, TLS is enabled with certificate verification.

See [`config/reference.md`](./config/reference.md) for the complete field list.

## Startup and shutdown

Initialize the database once during application startup:

```ts
import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, initializeDatabase } from '@skeletonstructure/core/database';

const config = await loadConfig();
await initializeDatabase(config.database);

try {
  // Start the HTTP server and application work here.
} finally {
  await closeDatabase();
}
```

`initializeDatabase()` verifies connectivity with `SELECT 1` before it resolves. If the database is unreachable, it throws `DatabaseError` with code `DATABASE_INITIALIZATION_FAILED`, closes the partially created pool, and startup should fail. Error messages never include the connection URL, password, host, or SQL details.

Duplicate calls to `initializeDatabase()` fail with `DATABASE_ALREADY_INITIALIZED`. `closeDatabase()` is idempotent and should be called from the application shutdown path.

## Using the shared database from modules

Modules should obtain the already initialized database:

```ts
import { sql } from 'drizzle-orm';
import { getDatabase } from '@skeletonstructure/core/database';

export async function pingDatabase() {
  const { db } = getDatabase();
  return db.execute(sql`select 1 as ok`);
}
```

For a use-case transaction:

```ts
import { sql } from 'drizzle-orm';
import { getDatabase } from '@skeletonstructure/core/database';

export async function runUseCase() {
  const database = getDatabase();

  return database.transaction(async (tx) => {
    // Use tx for every query in this unit of work.
    return tx.execute(sql`select 1 as ok`);
  });
}
```

`getDatabase()` throws `DATABASE_NOT_INITIALIZED` if startup skipped initialization. Do not import `pg` in modules, construct `Pool` instances, or expose the raw pool. The public `Database` interface intentionally does not expose credentials or pool internals.

Prefer Drizzle query builders. Raw SQL is allowed only through Drizzle tagged templates with parameters and must never be built by string concatenation.

## Health checks

`database.health()` is a database readiness check:

```ts
import { checkDatabaseHealth } from '@skeletonstructure/core/database';

const result = await checkDatabaseHealth();
// { status: 'ok' }
// { status: 'error', reason: 'DATABASE_UNAVAILABLE' }
// { status: 'error', reason: 'DATABASE_NOT_INITIALIZED' }
```

This is intentionally separate from application liveness. Process liveness means the event loop is responsive and must not query PostgreSQL. Readiness may include database availability, migration state, and future module health contributors. Health output contains only a status and short reason code; it never contains credentials, hostnames, connection strings, or SQL errors.

HTTP health endpoints are provided by the M5 API adapter; see [`api.md`](./api.md#health-endpoints).

## Migrations

Core migration SQL lives in `packages/core/migrations/`. The committed `0000_core_baseline` migration is intentionally empty: it establishes the workflow without introducing application tables. M6 modules own their SQL in `packages/module-users/migrations/` and `packages/module-auth/migrations/`; M8 modules own `catalog_items`, `commerce_products`, `inventory_items`, and the three `orders_*` tables in their respective package folders.

Generate a reviewed SQL migration:

```bash
pnpm db:generate --custom --name=add_example_table
pnpm db:generate:users --custom --name=add_users_field
pnpm db:generate:auth --custom --name=add_auth_index
pnpm db:generate:catalog --custom --name=add_catalog_index
pnpm db:generate:products --custom --name=add_product_field
pnpm db:generate:inventory --custom --name=add_inventory_index
pnpm db:generate:orders --custom --name=add_order_index
```

Apply migrations explicitly:

```bash
pnpm db:migrate
# equivalent CLI form:
pnpm skeleton db migrate
```

`pnpm db:migrate` loads the same validated configuration as the application, initializes the shared database, applies core/users/auth, catalog, products, inventory, then orders migrations in dependency order, and closes the pool. `runM8Migrations(database)` from `@skeletonstructure/app-composition` is the programmatic equivalent; `runAuthUsersMigrations(database)` covers only the M6 subset. Production must not auto-migrate on startup; migration remains an explicit operator action.

The runner obtains a dedicated client from the shared pool, takes a PostgreSQL advisory lock, applies migrations on that same client, then releases the lock and client. Concurrent migration processes therefore cannot race. Drizzle's internal `drizzle.__drizzle_migrations` table is the only table created by the baseline workflow.

Module-owned tables and migrations arrived in M6 and expanded in M8. Disabling a module does not drop its tables. Product and inventory rows reference `catalog_items` with `ON DELETE RESTRICT`; order items also reference catalog items so historical lines cannot be orphaned. Auth sessions and password-reset tokens have a separate explicit cleanup job (`pnpm auth:cleanup`); destructive migration policy and deployment readiness enforcement are still operator responsibilities.

## Testing

Ordinary unit tests use injected fake pools and migrators and do not require PostgreSQL. Integration tests use Testcontainers with `postgres:16-alpine` and verify:

- initialization against a real database;
- fresh migration and no-op re-run;
- readiness health and clean pool shutdown;
- users module constraints and ownership checks;
- auth flows, session rotation, CSRF, reset tokens, and the authorization matrix.

Run only that test with:

```bash
pnpm test:integration
```

## Known limitations

- Module migration ordering is explicit in the composition/migration script; there is no automatic discovery.
- No destructive-migration flag or readiness gate for pending module migrations exists yet.
- HTTP health endpoints exist but do not report per-module migration state.
- Backups, restore drills, least-privilege database roles, and cleanup scheduling remain operator responsibilities.
