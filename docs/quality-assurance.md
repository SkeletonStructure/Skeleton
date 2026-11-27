# Quality assurance

SkeletonStructure uses layered tests and CI checks to catch regressions before merge. Every layer is deterministic and can be run locally with the commands below.

## Test layers

| Layer           | Command                                                                | What it covers                                                                                                   |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unit            | `pnpm test:unit`                                                       | Pure logic, schemas, registry, security primitives, module contracts that do not need infrastructure             |
| Integration     | `pnpm test:integration`                                                | Fastify/PostgreSQL integration for core, modules, app composition, and the e-commerce demo, using Testcontainers |
| Contract        | `pnpm test:contract`                                                   | Public SDK boundaries and generated operation type aliases                                                       |
| Regression      | `pnpm test:regression`                                                 | Explicit tests for previously fixed failure modes and invariants                                                 |
| Migration smoke | `pnpm test:migration-smoke`                                            | Real `pnpm db:migrate` run against a temporary PostgreSQL container, including the no-op re-run                  |
| Full suite      | `pnpm test`                                                            | Everything in the four layers above, plus any future Vitest layer added to the root config                       |
| Browser E2E     | `pnpm demo:ecommerce:test:e2e`                                         | Real browser storefront flow against a real API and PostgreSQL container                                         |
| Artifact checks | `pnpm sdk:check`, `pnpm openapi:check`, `pnpm demo:ecommerce:verify`   | Generated artifacts match their committed sources                                                                |
| Config docs     | `pnpm config:docs && git diff --exit-code -- docs/config/reference.md` | Configuration reference matches the live schema                                                                  |

`pnpm test` is the local convenience command. CI runs the layers separately so each result is visible as its own required status.

Integration, browser E2E, the migration smoke test, and several regression tests require Docker because they start real PostgreSQL containers. Pure unit and artifact tests do not.

## Writing tests

- Add unit tests for pure logic and validation.
- Add integration tests when behavior depends on HTTP, PostgreSQL, migrations, or module composition.
- Add a regression test whenever a bug is fixed. Name the file `*.regression.test.ts` and place it under `tests/regression/` or the affected package's `tests/` directory.
- Keep tests independent. Do not rely on execution order or shared mutable state.
- Prefer real integration testing over mocks when the behavior depends on PostgreSQL or Fastify.
- Do not weaken or delete existing tests to make a change pass.

Regression tests already pin these invariants:

- Public OpenAPI excludes internal health/config surfaces.
- Demo-only routes stay local to the cart.
- Every discovered SQL file lives in a `migrations` directory and contains no destructive DDL.
- Migrations retain uniqueness/ownership constraints and the v0.1.0 files remain byte-for-byte present.
- `pnpm db:migrate` applies every module migration and reports a no-op on a second run.
- Generated SDK and demo client artifacts stay bound to their sources.
- The v0.1.0 operation baseline keeps paths, operations, required fields, and response codes stable unless an explicit allowlist records the change.
- The real SDK client parses real Fastify success and 404 responses.
- CSRF tokens cannot be replayed after rotation; password reset tokens cannot be replayed or used after expiry.
- Concurrent orders with the same idempotency key resolve to one order.
- Email validation preserves v0.1.0 acceptance while parsing pathological input linearly; bearer headers and SDK base URLs also handle pathological input linearly.
- Structured logs filter by level, redact nested secret paths, control unsafe values, tolerate a broken sink, and bind `requestId` to request logs.
- Shared limiters are isolated per route, fail closed on storage errors, and report an injected store as unready.
- Audit rows are append-only, validated, transaction-bound, and emitted for auth success/failure and role assignment.
- Lifecycle transitions are monotonic, readiness drains before close, shutdown is one-shot, and a hung close ends with `SIGKILL` after the configured timeout.

## Commands before opening a pull request

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

`pnpm run ci` is also available as a shorter local check, but CI runs the explicit steps above.

## M11 verification snapshot

The complete PR-level gate was executed locally for the M11 branch before documentation was committed:

- `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm lint` passed.
- Unit: 19 files / 131 tests; integration: 12 files / 62 tests; contract: 5 files / 16 tests; regression: 10 files / 28 tests; `pnpm test`: 46 files / 237 tests.
- `pnpm test:migration-smoke`, `pnpm openapi:check`, `pnpm sdk:check`, `pnpm demo:ecommerce:verify` (including Playwright E2E), and the demo production build passed.
- `pnpm config:docs` produced no `docs/config/reference.md` drift.
- `pnpm audit --audit-level=high` passed with 0 high/critical advisories and 3 moderate transitive dev/test advisories.

These are local results. No GitHub CI or review result is claimed for the unmerged branch; re-query after the PR is pushed.

## CI behavior

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. It fails the workflow if any required check fails. Actions are pinned to verified commit SHAs, permissions are limited to `contents: read`, and superseded runs are cancelled.

The verify job reports the migration CLI smoke check as its own step. The workflow does not use repository secrets. Dependency installation always uses the committed lockfile.

## CodeQL triage

GitHub CodeQL default setup is configured outside the repository. The initial run produced five warning-level findings. GitHub state queried on 2026-11-27 (re-query before relying on it):

| Finding                        | Location                                             | GitHub state        | Disposition                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/missing-rate-limiting` × 2 | `packages/core/src/api/server.ts` pre-handler hooks  | open (#4 and #5)    | The limiter existed but was registered after those hooks; M11 registers explicit shared policies before the hooks. No dismissal: re-query after merge and record fresh evidence before any owner action. |
| `js/polynomial-redos`          | `packages/sdk/src/client.ts` base URL normalization  | fixed on 2026-11-26 | Fixed with a linear trailing-slash loop; regression test retained.                                                                                                                                       |
| `js/polynomial-redos`          | `packages/module-users/src/service.ts` email parsing | fixed on 2026-11-26 | Fixed with linear parsing that preserves v0.1.0 acceptance; regression test retained.                                                                                                                    |
| `js/polynomial-redos`          | `packages/module-auth/src/service.ts` bearer parsing | fixed on 2026-11-26 | Fixed with a linear prefix/whitespace scan; regression test retained.                                                                                                                                    |

New CodeQL findings must be triaged before merge: fix them or record a written justification in this file. Evidence, exact alert IDs, and owner actions are in [`security/github-governance.md`](./security/github-governance.md).

## Compatibility strategy

Compatibility is checked without adding a second demonstration application.

1. **Public API:** the committed OpenAPI artifact and regression tests fail on internal route exposure or loss of the `/v1` boundary. `docs/compatibility/v0.1.0-operations.json` freezes the v0.1.0 paths, operations, required parameters/body fields, and response codes. An intentional breaking change must update the artifact deliberately or add an entry to `docs/compatibility/v0.1.0-allowlist.json`. The allowlist is a JSON array of operation keys in the form `/v1/path:method` (for example, `/v1/orders:get`); a bare path key such as `/v1/orders` permits the removal of that path and all its operations. New operations are not treated as v0.1.0 breaks; response body schemas are not frozen by the operation snapshot.
2. **SDK:** generated type checks and contract tests fail on drift. `tests/regression/sdk-runtime.regression.test.ts` runs the real SDK client against a real Fastify server through an in-process fetch adapter, covering success and error envelopes.
3. **Database:** fresh migration and no-op re-run tests are part of the integration and regression suites, and `pnpm test:migration-smoke` exercises the real `pnpm db:migrate` CLI against a temporary PostgreSQL container. `docs/compatibility/v0.1.0-migrations.json` pins the SHA-256 of every v0.1.0 migration so the baseline cannot be altered; future migrations must be appended, not rewritten.
4. **Breaking changes:** any incompatible API, SDK, configuration, or schema change must be marked under `Breaking` in `CHANGELOG.md`, added to the release notes, and released with an appropriate version bump.

## GitHub settings not enforced by files

The following must be configured by a repository owner in GitHub settings. The active `protect-main` ruleset currently has zero required checks and zero required approvals:

- Require these exact status checks: `verify`, `demo-ecommerce-e2e`, `Analyze (javascript-typescript)`, and `Analyze (actions)`. The last two are CodeQL **job** names; the CodeQL workflow run name is dynamic.
- Require at least one approving review, dismiss stale approvals on new pushes, and keep deletion, non-fast-forward, PR-only, and no-bypass rules active.
- Add a second maintainer with write access and update CODEOWNERS if independent review is required. Current CODEOWNERS is `* @MrUranium1`.
- Confirm secret scanning and push protection; enable non-provider patterns and validity checks if accepted by the owner.
- Confirm Dependabot security updates in addition to the committed version-update file.

See [`security/github-governance.md`](./security/github-governance.md) for the dated API evidence and exact commands, and `.github/pull_request_template.md` for the PR checklist.
