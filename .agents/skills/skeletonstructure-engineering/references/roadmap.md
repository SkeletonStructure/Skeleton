# Roadmap and current status

Snapshot verified 2026-11-27 from the repository, git history, GitHub API, and sibling workspaces. GitHub/API facts in this file cannot be proven from repository files alone; re-query GitHub before relying on them. Re-verify remote refs before acting; local tracking refs may be stale.

## Verified completed milestones

| Milestone           | Commit evidence                                       | Result                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 foundation       | `16bf2c8` (+ `b4cda5b`)                               | pnpm monorepo, strict TypeScript, Biome, Vitest, CI skeleton, README, security/contributing docs, LICENSE, VERSION.                                                                 |
| M2 configuration    | `2dd7528`                                             | `defineConfig`, env precedence, Zod validation, aggregated errors, `env(...)` secrets, redacted summary, generated config reference.                                                |
| M3 database         | `2fda574`                                             | Shared PostgreSQL pool/Drizzle, verified init, graceful shutdown, transactions, health, advisory-locked migrations, Testcontainers coverage.                                        |
| M4 module registry  | `24df635`                                             | `ModuleDefinition`, static composition, explicit enable/disable, dependency/port validation, activation report, ADR 0001.                                                           |
| M5 API              | `38d6f0c`                                             | One Fastify instance, `/v1`, request IDs, envelopes, permission guard, exact-origin CORS, per-process rate limit, health, public config, generated OpenAPI, ADR 0002.               |
| M6 auth/authz       | `59b72b8`                                             | users/auth modules, Argon2id, opaque hashed sessions, httpOnly cookies, CSRF, roles/permissions, single-use resets, console email, cleanup job, ADR 0003.                           |
| M7 SDK              | `8433ae1`                                             | OpenAPI-derived types, deterministic generate/check, thin `fetch` client, cookie/bearer auth, typed errors, examples, ADR 0004.                                                     |
| M8 business modules | `8f10e0c`                                             | catalog/products/inventory/orders, ports, server-authoritative prices, immutable snapshots, transactional idempotency, static composition, ADRs 0005/0006.                          |
| M9a demo            | `be76283`                                             | Vite storefront, separate Fastify API, app-local cart/migration, seeded user/products, checkout to confirmation, order history, generated demo artifacts, Playwright E2E, ADR 0007. |
| M10 release         | `a5fb7c3`, `d37d01b`, `d09987b`, `1e04788`, `9d665ff` | Release docs, threat model, security/release checklists, CHANGELOG, VERSION/package alignment, release notes, owner sign-off, GitHub release.                                       |

Tag: annotated `v0.1.0` → release commit `9d665ff3462cfc3b4f7adb7f96a2b95974f7ffff`.

## Post-release hardening

Verified as merged, not part of the `v0.1.0` tag:

| Change                                                                                     | Evidence                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Layered QA/CI, compatibility baselines, regression tests, ReDoS fixes, migration CLI smoke | PR #1, head `dde23ba59df044ce766932ceeeeded5a8c6b2f05`, merged as `1940dfc1537e27d4c91e8930d1f7dd26408c285b` on 2026-11-26.          |
| Dependabot action/dependency bumps                                                         | PRs #2–#5 merged; remote `main` at `b71653cfc45553101a7968002818220a50bffa6e` on 2026-11-27.                                         |
| M11 security and operational hardening                                                     | PR #7 head `b09356fb45b250fd28a5cf9592eaf1fb0ae08de0`, merged as `b399a21cf86866a725eb29b9c95ff3405853c7b8` on 2026-11-27T11:04:44Z. |
| Post-M11 documentation cleanup                                                             | PR #8 head `fd8c55233b241c4b2c0e84869bb96f98efc0bb04`, merged as `e4eae56bce29e956d77282d89cc58e38549f4e17` on 2026-11-27.           |
| M12 application runtime and starter                                                        | PR #9 head `b3aeb7dd7d6b34c66bcd2aa5596810e0edeb6980`, merged as `9f1455705d61dd8cd2fe6bddfc3164e31291b7f6` on 2026-11-27T12:33:15Z. |

PR #1 reported all checks successful: `verify`, `demo-ecommerce-e2e`, `Analyze (javascript-typescript)`, `Analyze (actions)`, `CodeQL`, and Dependabot config check. Remote `main` at `b71653c` also had successful `CI` and `Push on main` runs at the time of research. Confirm with `gh run list` before repeating these results.

## M11 security and operational hardening (merged)

Prepared on `task/m11-security-hardening` from GitHub `main` at `2ae68eaa9a356127611a51dbbb553044a4f5daac` and merged through PR #7 as `b399a21cf86866a725eb29b9c95ff3405853c7b8` at 2026-11-27T11:04:44Z. M11 is on `main` but is not part of the `v0.1.0` tag and has no separate tag.

| Workstream | Scope                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| M11.1      | Governance evidence and repair of eight pre-existing Biome formatting errors seen in CI run `45969317303`.                                    |
| M11.2      | Core rate-limit storage port, memory default, optional injected Redis adapter, fail-closed plugin registration, config/env updates, ADR 0008. |
| M11.3      | Append-only `core_audit_events` migration, validated core sink, auth/users integration, readiness check, ADRs 0009/0010.                      |
| M11.4      | Core structured logger and lifecycle/shutdown coordinator, API/request correlation integration, startup-script wiring, ADRs 0011/0012.        |
| M11.5      | Regression coverage for redaction, request correlation, audit failure, limiter failure, readiness reasons, lifecycle, and shutdown timeout.   |
| M11.6      | Documentation and PR readiness, plus two read-only review passes that fixed six concrete defects before merge.                                |

PR #7 reported five successful checks: `verify` and `demo-ecommerce-e2e` in run `45986862863`, `Analyze (javascript-typescript)` and `Analyze (actions)` in run `45986855658`, and `CodeQL`. No approving review was recorded. Post-merge runs `45987449807` (`CI`) and `45987449130` (`Push on main`) also succeeded at `b399a21`.

## M12 application runtime (merged)

Prepared on `task/m12-application-runtime` from GitHub `main` at `e4eae56bce29e956d77282d89cc58e38549f4e17` and merged through PR #9 as `9f1455705d61dd8cd2fe6bddfc3164e31291b7f6` at 2026-11-27T12:33:15Z:

| Workstream | Scope                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| M12.1      | Shared `startApplication()` and `runApplicationMigrations()` helpers in `@skeletonstructure/app-composition`; root and demo scripts adopt them. |
| M12.2      | Additive core migration readiness helper using explicit Drizzle folders and fixed `MIGRATIONS_PENDING` reason.                                  |
| M12.3      | `templates/basic-app` starter with its own config, scripts, and integration test.                                                               |
| M12.4      | Unit/integration coverage, ADR 0013, and documentation/status reconciliation.                                                                   |

No config field, public route, SDK/OpenAPI artifact, shared migration, new runtime dependency, or `v0.1.0` behavior is changed. PR #9 reported five successful checks and no approving review; post-merge `CI` (`45999611587`) and `Push on main` (`45999611907`) runs succeeded. M12 is on `main` but is not part of a release tag or GitHub release.

## Current development state

- M11 security/operational hardening, PR #8 documentation cleanup, and M12 application runtime work are merged on `main`; no post-`v0.1.0` release tag or GitHub release is claimed.
- ADR 0013 records M12's boundary; the template is a minimal starter, not a production deployment manifest.
- The foundation is in post-release maintenance/QA hardening; `v0.1.0` remains the tagged baseline.
- GitHub `main` was verified at `9f14557`; local tracking refs may still be stale. Do not reset from an unverified ref.
- The pre-M11 `main` CI run `45969317303` failed in lint/format; M11.1 fixed those eight errors, PR #7 checks passed, and post-merge runs at `b399a21` passed.
- All five CodeQL alerts are now marked `fixed` by GitHub, including #4/#5 (`js/missing-rate-limiting`) at 2026-11-27T11:05:45Z. No alert was dismissed.
- The current `protect-main` ruleset enforces deletion/non-fast-forward and PR-only changes, but has zero required status checks and zero required approvals; CODEOWNERS review is disabled in that ruleset.
- CODEOWNERS is `* @MrUranium1`; no second write maintainer is verified. `chocolatemilk-as` has pull-only access.

## Next planned milestone — M9b, still deferred

`docs/m9.md` and the blueprint define M9b as a separate, explicitly approved milestone:

- Reuse `auth`, `users`, `catalog`, and `orders`.
- Add demo-local `menu` and `branches` extensions.
- Flow: choose branch → browse menu → place order → view order.
- Playwright happy path must pass.
- No new shared module in `packages/`.
- Docs must map reused modules vs demo-local extensions.
- Start only after M9a acceptance is verified.

M9b is **planned/deferred**, not implemented and not started. Do not report it as current work.

## Proposed or explicitly deferred work

From release notes, blueprint, ADRs, and QA docs:

- Independent second-maintainer security review.
- Real required status checks/approvals and a second maintainer.
- CodeQL alert triage: all five alerts are now `fixed`; #4/#5 were closed by GitHub after the merge with no dismissal. Re-query before any annotation and record fresh evidence if a future scan reopens them.
- Real email adapter; per-account limits, CAPTCHA, and MFA. Shared limiter storage exists in M11, but an application still must inject the Redis client.
- Payment ADR, payments, refunds, cancellations, inventory release.
- Guest checkout. Persistent audit logging exists in M11; retention/export procedures and stronger tamper evidence remain future work.
- Multi-tenancy, additional database engines, npm publication.
- Non-provider secret patterns and a dedicated CI secret scanner.
- Concrete procedure for upgrading dependent application forks.
- Cleanup of three moderate dev/transitive advisories.

## Known blockers and process gaps

- No independent second maintainer; v0.1.0 security sign-off is documented owner self-review.
- GitHub ruleset does not currently require named checks or approvals.
- M11 merged without an approving review; the ruleset still does not require checks or approvals.
- Blueprint still says implementation never started; several ADRs describe only the state at their milestone.
- No production deployment manifests; no documented fork-upgrade process.
- Local tracking refs can lag GitHub; verify before relying on them.

## Technical debt / unresolved questions

- Why the independent-maintainer M10 criterion was waived is not recorded beyond the owner self-review limitation.
- Why M9b was deferred despite the blueprint's MVP definition of done is not recorded in detail.
- Provenance/checksum linking `Skeleton-0.1.0.zip` to one exact commit is not documented.
- No accepted ADRs yet for payments, real email, file storage, or multi-tenancy.
- `SESSION_SECRET` is declared but no consumer was found.
- `templates/basic-app` is present on `main` after PR #9; it is a minimal starter and still has no production deployment example.
