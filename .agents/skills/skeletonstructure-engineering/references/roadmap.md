# Roadmap and current status

Snapshot verified 2026-11-27 from the repository, git history, GitHub API, and sibling workspaces. GitHub/API facts in this file cannot be proven from repository files alone; re-query GitHub before relying on them. Re-verify remote refs before acting; local tracking refs may be stale.

## Verified completed milestones

| Milestone | Commit evidence | Result |
|---|---|---|
| M1 foundation | `16bf2c8` (+ `b4cda5b`) | pnpm monorepo, strict TypeScript, Biome, Vitest, CI skeleton, README, security/contributing docs, LICENSE, VERSION. |
| M2 configuration | `2dd7528` | `defineConfig`, env precedence, Zod validation, aggregated errors, `env(...)` secrets, redacted summary, generated config reference. |
| M3 database | `2fda574` | Shared PostgreSQL pool/Drizzle, verified init, graceful shutdown, transactions, health, advisory-locked migrations, Testcontainers coverage. |
| M4 module registry | `24df635` | `ModuleDefinition`, static composition, explicit enable/disable, dependency/port validation, activation report, ADR 0001. |
| M5 API | `38d6f0c` | One Fastify instance, `/v1`, request IDs, envelopes, permission guard, exact-origin CORS, per-process rate limit, health, public config, generated OpenAPI, ADR 0002. |
| M6 auth/authz | `59b72b8` | users/auth modules, Argon2id, opaque hashed sessions, httpOnly cookies, CSRF, roles/permissions, single-use resets, console email, cleanup job, ADR 0003. |
| M7 SDK | `8433ae1` | OpenAPI-derived types, deterministic generate/check, thin `fetch` client, cookie/bearer auth, typed errors, examples, ADR 0004. |
| M8 business modules | `8f10e0c` | catalog/products/inventory/orders, ports, server-authoritative prices, immutable snapshots, transactional idempotency, static composition, ADRs 0005/0006. |
| M9a demo | `be76283` | Vite storefront, separate Fastify API, app-local cart/migration, seeded user/products, checkout to confirmation, order history, generated demo artifacts, Playwright E2E, ADR 0007. |
| M10 release | `a5fb7c3`, `d37d01b`, `d09987b`, `1e04788`, `9d665ff` | Release docs, threat model, security/release checklists, CHANGELOG, VERSION/package alignment, release notes, owner sign-off, GitHub release. |

Tag: annotated `v0.1.0` → release commit `9d665ff3462cfc3b4f7adb7f96a2b95974f7ffff`.

## Post-release hardening

Verified as merged, not part of the `v0.1.0` tag:

| Change | Evidence |
|---|---|
| Layered QA/CI, compatibility baselines, regression tests, ReDoS fixes, migration CLI smoke | PR #1, head `dde23ba59df044ce766932ceeeeded5a8c6b2f05`, merged as `1940dfc1537e27d4c91e8930d1f7dd26408c285b` on 2026-11-26. |
| Dependabot action/dependency bumps | PRs #2–#5 merged; remote `main` at `b71653cfc45553101a7968002818220a50bffa6e` on 2026-11-27. |

PR #1 reported all checks successful: `verify`, `demo-ecommerce-e2e`, `Analyze (javascript-typescript)`, `Analyze (actions)`, `CodeQL`, and Dependabot config check. Remote `main` at `b71653c` also had successful `CI` and `Push on main` runs at the time of research. Confirm with `gh run list` before repeating these results.

## Current development state

- **No new feature milestone is verified as active.**
- The foundation is in post-release maintenance/QA hardening.
- The local branch was ahead of its stale local tracking ref by one commit (`dde23ba` vs local `origin/main` `9d665ff`), while the true GitHub `main` was separately at `b71653c`. Do not reset away the local QA commit; fetch and verify first.
- Remote workflow steps match the local CI workflow, but action SHA pins were bumped by Dependabot.
- Three CodeQL ReDoS alerts were marked `fixed` after PR #1; two `js/missing-rate-limiting` alerts remain open and were not dismissed.
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
- CodeQL alert triage: rescan/annotate or dismiss the two accepted rate-limit findings with documented rationale.
- Real email adapter; shared/Redis rate limiting; MFA/OAuth/CAPTCHA.
- Payment ADR, payments, refunds, cancellations, inventory release.
- Guest checkout and persistent audit logging.
- Multi-tenancy, additional database engines, npm publication.
- Non-provider secret patterns and a dedicated CI secret scanner.
- Concrete procedure for upgrading dependent application forks.
- Cleanup of three moderate dev/transitive advisories.

## Known blockers and process gaps

- No independent second maintainer; v0.1.0 security sign-off is documented owner self-review.
- GitHub ruleset does not currently require named checks or approvals.
- `docs/quality-assurance.md` still describes three ReDoS alerts as open; GitHub now marks them fixed.
- Blueprint still says implementation never started; several ADRs describe only the state at their milestone.
- No production deployment manifests; no documented fork-upgrade process.
- Local clone lags upstream; verify before relying on local refs.

## Technical debt / unresolved questions

- Why the independent-maintainer M10 criterion was waived is not recorded beyond the owner self-review limitation.
- Why M9b was deferred despite the blueprint's MVP definition of done is not recorded in detail.
- Provenance/checksum linking `Skeleton-0.1.0.zip` to one exact commit is not documented.
- No accepted ADRs yet for payments, real email, file storage, or multi-tenancy.
- `SESSION_SECRET` is declared but no consumer was found.
- `templates/*` is in workspace config/docs but the directory is absent.
