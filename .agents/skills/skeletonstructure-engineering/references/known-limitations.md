# Known limitations and gotchas

Use this as a checklist before claiming a capability or starting work.

## Product and release scope

- `v0.1.0` is a first usable release, **not** production-ready beyond tested scope.
- M9b restaurant demo is deferred, not implemented or started.
- No payments, guest checkout, refunds, cancellations, inventory release, MFA, OAuth, CAPTCHA, real email, file uploads, webhooks, persistent audit logging, Redis/shared rate limiting, multi-tenancy, or extra database engines.
- No npm publication; all packages/apps are private.
- No production deployment manifests or documented fork-upgrade procedure.
- Reserved inventory remains reserved after order confirmation because cancellation/release is not implemented.

## Historical/documentation drift

- The blueprint says no backend code has been written; that was true before `16bf2c8` and is stale now.
- ADR 0002 says OpenAPI only contains `/v1/config/public`; current artifact has 21 operations.
- ADR 0004 says the SDK has three namespaces; current SDK has seven.
- `docs/quality-assurance.md` says three ReDoS alerts remain open; GitHub marked them fixed on 2026-11-26.
- `CONTRIBUTING.md` and some milestone docs still mention `pnpm test` as the main gate; use `docs/quality-assurance.md` and the PR template.
- README's `test:migration-smoke` table entry is self-referential; `package.json` has the real command.
- `templates/*` is in workspace config/README but the directory is absent.
- `SESSION_SECRET` is declared as a secret env key but no consuming implementation was found.
- Public OpenAPI operations have blank/missing `operationId` and `tags`; SDK names come from path/method generation.
- The shared SDK sanitizes error messages; the demo-local client passes messages through. Do not generalize demo behavior.

## Repository/remote state

- Local refs and GitHub diverged: the local branch was ahead of its stale tracking ref (`dde23ba` vs local `origin/main` `9d665ff`), while GitHub `main` was separately at `b71653c`. Always verify; do not reset based on an unverified ref.
- `v0.1.0` points to `9d665ff`; post-tag QA hardening is not in the tag.
- GitHub canonical repo is `SkeletonStructure/SkeletonStructure`; old remote URL redirects.
- `Skeleton-0.1.0.zip` provenance/checksum is not documented in repository docs.
- Commit author display names vary; git metadata uses the same owner email. No distinct second maintainer is evidenced.

## GitHub process gaps

- Current `protect-main` ruleset enforces deletion/non-fast-forward and PR-only changes, but has zero required status checks and zero required approvals; CODEOWNERS review is disabled in that ruleset.
- CODEOWNERS is `* @MrUranium1`; a second write maintainer is not verified. Security sign-off is owner self-review.
- Two CodeQL `js/missing-rate-limiting` alerts remain open and were not dismissed; owner annotation/dismissal with documented rationale is pending.
- No dedicated CI secret scanner; native secret scanning/push protection are enabled, non-provider patterns/validity checks disabled.
- Three moderate dev/transitive advisories were present during research: `esbuild` via `drizzle-kit`, `glob` and `minimatch` via `testcontainers > archiver`. `pnpm audit --audit-level=high` passed then; re-run it after dependency changes.
- For current CodeQL alert state, query GitHub; `docs/quality-assurance.md` is stale for the three fixed ReDoS alerts.

## Architecture/implementation gotchas

- All modules are disabled by default; enabling a feature requires config and composition awareness. Do not assume an optional module is active.
- There is no plugin/disk discovery. Adding a module means explicit composition, migrations, permissions, tests, and docs.
- Core must not import concrete modules; modules must not import each other's internals.
- Ports are declared strings with versions; ambiguity fails before listen. Do not silently pick a provider.
- Demo cart is app-local and uses public APIs only; do not move it into shared packages without approval.
- Buyer context is user-only in v0.1.0; guest refs are typed but rejected.
- Client-supplied amounts are rejected when a price resolver exists; prices are server-authoritative.
- Migrations are explicit operator actions; no auto-migration on startup. Old migrations are hash-pinned and must not be rewritten.
- `/health/live` and `/health/ready` are internal and excluded from public OpenAPI.
- SDK has no runtime dependencies and no browser storage; contract tests enforce this.
- Playwright uses ports `3000`/`5173` and `reuseExistingServer: false`; E2E can fail if those are occupied. Do not kill unrelated processes.

## Ecosystem assumptions

- No Orgo implementation or reference was found. Ask for its location if the user expects one.
- Bookstore is a local integration example, not an upstream-documented application; its app code is uncommitted and version-skewed from remote `main`.
- Independent frontend/backend deployment is demonstrated locally, but production deployment configuration is absent.
- The documentation site is separate; backend work should not rewrite it.

## Unresolved historical questions

- Why the independent-maintainer M10 criterion was waived beyond owner self-review.
- Why M9b was deferred despite the blueprint's MVP definition of done.
- Who the intended second maintainer is.
- Concrete upgrade procedure for dependent forks.
- Future design decisions for payments, real email, cancellation/refunds, and inventory release.
