# Basic SkeletonStructure app template

A minimal starting application that composes the shared M8 modules through
`@skeletonstructure/app-composition`. It contains no app-local domain module and
makes no change to shared packages.

## Start from the template

From the repository root, with PostgreSQL available:

```bash
cp -R templates/basic-app apps/my-app
cd apps/my-app
cp .env.example .env
pnpm db:migrate
pnpm start
```

Edit `.env` before migrating. Check `GET /health/live`, `GET /health/ready`, and
`GET /v1/config/public` to confirm startup. The starter enables an opt-in
migration readiness check: if a required migration has not been applied,
`/health/ready` returns `503` with reason `MIGRATIONS_PENDING` and no SQL,
path, or configuration detail.

All modules are disabled by default. Enable the required graph in
`skeleton.config.ts` under `config.modules` before using domain routes.

## Add an app-local module

Keep domain code in the application and pass its static definition through the
composition seam:

```ts
import { createM8Composition } from '@skeletonstructure/app-composition';

export function createMyAppComposition(options) {
  return createM8Composition({
    ...options,
    additionalModules: [myModule.definition],
  });
}
```

The application owns its module tables, migrations, permissions, routes, tests,
and deployment. Do not add app-local code to `packages/` or the shared SDK.
When adding an app-local migration folder, append it to the template's
`migrationFolders` array so readiness covers the complete expected migration
set. Migrations remain an explicit operator step; startup never auto-migrates.

## Scripts

- `pnpm typecheck` — type-check the starter.
- `pnpm db:migrate` — apply the shared M8 migrations.
- `pnpm start` — build, start, and mark ready only after `listen()`.
- `pnpm test:integration` — verify startup, health, public config, and readiness.

This is a starter foundation, not a production deployment manifest. The
application remains responsible for secrets, TLS, exact CORS origins, isolation,
backups, monitoring, and release review.
