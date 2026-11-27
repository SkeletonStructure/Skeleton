# Testing and quality

Counts below are a verified snapshot of the `dde23ba` QA tree; re-run to confirm current numbers after dependency updates.

## Test layers

| Layer | Command | Snapshot | Purpose | Docker? |
|---|---|---:|---|---|
| Unit | `pnpm test:unit` | 15 files / 104 cases | Pure config, registry, API helpers, security primitives, module/service logic without DB. | No |
| Integration | `pnpm test:integration` | 11 files / 56 cases | Fastify `inject` and/or real PostgreSQL flows across core, auth, users, catalog, products, inventory, orders, app-composition, demo checkout. | Mostly yes; two core API files use a fake DB. |
| Contract | `pnpm test:contract` | 5 files / 16 cases | Public SDK boundaries, generated operation aliases, module port/route/permission/OpenAPI contracts. | No |
| Regression | `pnpm test:regression` | 9 files / 19 cases | Previously fixed failures and invariants: API surface, artifacts, migrations, CSRF/reset replay, idempotency, linear parsing, SDK runtime. | 4 of 9 files. |
| Full Vitest | `pnpm test` | 40 files / 195 cases | Convenience run across package tests, app integration, root regressions; excludes Playwright. | Same as layers. |
| Browser E2E | `pnpm demo:ecommerce:test:e2e` | 1 spec / 1 case | Browser login → browse → cart add/remove → checkout → order history. | Yes: PostgreSQL container + Chromium. |
| Migration smoke | `pnpm test:migration-smoke` | 1 file / 1 case | Real `pnpm db:migrate` against a temporary PostgreSQL container, then no-op re-run. | Yes |

Docker-backed tests use Testcontainers `postgres:16-alpine` with development credentials. Playwright uses API port `3000` and Vite port `5173`, with `reuseExistingServer: false`; verify those ports are free before running and do not kill unrelated processes.

## Commands

Minimum local gate:

```bash
pnpm run ci
```

This runs typecheck, lint, full Vitest, SDK check, demo OpenAPI check, and demo client check. It is shorter than CI.

Full PR-level gate:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:regression
pnpm test:migration-smoke
pnpm openapi:check
pnpm sdk:check
pnpm demo:ecommerce:verify
pnpm --filter @skeletonstructure/demo-ecommerce build
pnpm config:docs && git diff --exit-code -- docs/config/reference.md
pnpm audit --audit-level=high
```

`pnpm ci` is wrong: it invokes pnpm's built-in command and fails. Use `pnpm run ci`.

## Tooling

- Node `>=22`; pnpm `10.34.9` pinned by `packageManager`. CI uses Node `24.x`.
- TypeScript builds project references with `tsc -b --pretty false`.
- Biome is authoritative for lint/format: `biome check .`; `pnpm format` applies formatting.
- Vitest layer configs are root-level: `vitest.unit.config.ts`, `vitest.integration.config.ts`, `vitest.contract.config.ts`, `vitest.regression.config.ts`; root config is `vitest.config.ts`.
- Playwright config lives in `apps/demo-ecommerce/playwright.config.ts`; CI installs Chromium with `--with-deps`.

## Generated artifact checks

| Artifact | Check |
|---|---|
| `openapi/openapi.json` | `pnpm openapi:check` |
| `packages/sdk/generated/api.ts` | `pnpm sdk:check` |
| `apps/demo-ecommerce/openapi/demo-openapi.json` | `pnpm demo:ecommerce:openapi:check` |
| `apps/demo-ecommerce/src/web/demo-client.generated.ts` | `pnpm demo:ecommerce:client:check` |
| `docs/config/reference.md` | `pnpm config:docs && git diff --exit-code -- docs/config/reference.md` |

Never hand-edit generated artifacts. Change the source, regenerate with the documented script, and verify drift checks.

## CI workflow

`.github/workflows/ci.yml` triggers on every pull request and push to `main`, with `permissions: contents: read`, SHA-pinned actions, no workflow secrets, and two jobs:

- `verify`: frozen install, typecheck, SDK/example typecheck, lint, OpenAPI/SDK/demo artifact checks, all four Vitest layers, migration smoke, demo build, config docs drift, `pnpm audit --audit-level=high`.
- `demo-ecommerce-e2e`: frozen install, Playwright Chromium install, `pnpm demo:ecommerce:test:e2e`.

Remote `main` retained these steps after Dependabot bumped action versions.

## Compatibility and migration gates

- `docs/compatibility/v0.1.0-operations.json` freezes paths, operations, required parameters/body fields, and response codes.
- `docs/compatibility/v0.1.0-allowlist.json` is currently empty. Keys are `/v1/path:method` or a bare path; new operations are not breaks and response body schemas are not frozen.
- `docs/compatibility/v0.1.0-migrations.json` pins SHA-256 hashes of all v0.1.0 migration files.
- Migration safety regression recursively discovers SQL files, requires them under `migrations/`, rejects destructive DDL, and preserves uniqueness/ownership constraints.
- Fresh migration and no-op re-run are covered by integration and regression tests.
- Breaking API/SDK/config/schema changes require a `Breaking` changelog entry, release notes, and a version bump.

## Security checks

- `pnpm audit --audit-level=high` passed with 0 high/critical during research. The 3 moderate dev/transitive advisories were `esbuild` via `drizzle-kit`, and `glob`/`minimatch` via `testcontainers > archiver`. Re-run the audit after dependency changes; no audit output is committed.
- CodeQL default setup is outside the repository. GitHub/API state on 2026-11-27 (re-query before relying on it):
  - #1–#3 `js/polynomial-redos` — **fixed** after PR #1.
  - #4–#5 `js/missing-rate-limiting` in `packages/core/src/api/server.ts` — **open**, not dismissed; written rationale exists in `docs/quality-assurance.md` and owner action is still required.
  - `docs/quality-assurance.md` is stale for #1–#3; trust GitHub state and update the doc.

## Verification discipline

- Run the smallest relevant gate first, then the full gate when the change affects shared infrastructure.
- Capture actual output; do not paraphrase failure as success.
- If Docker, network, or a required tool is unavailable, state the limitation explicitly.
- A passing shortcut is not evidence that CI-equivalent checks ran.
- Keep tests independent; prefer real Fastify/PostgreSQL behavior when infrastructure semantics matter.
