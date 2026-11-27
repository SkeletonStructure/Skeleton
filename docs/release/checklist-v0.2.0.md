# v0.2.0 release checklist

This is the release record for `v0.2.0`. The historical first-release record remains in [`checklist.md`](./checklist.md). Every blocking item below was complete before the annotated tag and GitHub Release were published.

## Scope

- [x] Release scope is M11 hardening, M12 application runtime work, and the documentation reconciliation merged through PR #10.
- [x] M9b restaurant demo remains deferred and is not a release dependency.
- [x] E-commerce demo remains the primary demonstration application.
- [x] No new shared module, guest checkout, payment flow, Redis service, multi-tenancy, or extra database engine was added.
- [x] No public route, operation, permission, required field, or response-code change was made.
- [x] No breaking config change; existing defaults and the `v0.1.0` compatibility baseline are unchanged.

## Version artifacts

- [x] `VERSION` is `0.2.0`.
- [x] Root and all 13 workspace package manifests are `0.2.0`.
- [x] Generated OpenAPI metadata is `0.2.0`; public operations are unchanged.
- [x] `CHANGELOG.md` has a `0.2.0` section.
- [x] [`docs/releases/v0.2.0.md`](../releases/v0.2.0.md) records included work, compatibility notes, migration guidance, verification, and limitations.
- [x] README, SECURITY, API/database/SDK/security/QA docs, architecture ADR index, and engineering skill status references reflect the release.
- [x] Historical ADRs and the `v0.1.0` release record were not rewritten.
- [x] No npm publication was attempted.

## Verification

- [x] `pnpm install --frozen-lockfile` — lockfile current; no dependency change.
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test:unit` — 20 files / 135 tests.
- [x] `pnpm test:integration` — 15 files / 65 tests.
- [x] `pnpm test:contract` — 5 files / 16 tests.
- [x] `pnpm test:regression` — 10 files / 31 tests.
- [x] `pnpm test:migration-smoke` — 1 file / 1 test against a temporary PostgreSQL container.
- [x] `pnpm test` — 50 files / 247 tests.
- [x] `pnpm openapi:check` and `pnpm sdk:check`.
- [x] Demo OpenAPI/client checks and `pnpm config:docs` drift check pass.
- [x] `pnpm demo:ecommerce:verify` — demo integration and Playwright browser happy path.
- [x] `pnpm --filter @skeletonstructure/demo-ecommerce build`.
- [x] `pnpm audit --audit-level=high` — 0 high and 0 critical; 3 moderate dev/transitive advisories recorded in release notes.
- [x] GitHub PR checks and post-merge runs were verified before tag publication.

## Database and compatibility

- [x] The `v0.1.0` migration files remain byte-for-byte pinned by `docs/compatibility/v0.1.0-migrations.json`.
- [x] Only one core migration was appended for `core_audit_events`; no destructive DDL was added.
- [x] Fresh migration and no-op re-run smoke checks passed.
- [x] Root and demo startup readiness behavior is unchanged; migration readiness remains opt-in.
- [x] Startup does not auto-migrate; the explicit `pnpm db:migrate` operator step is documented in release notes.

## Security and governance

- [x] The historical `v0.1.0` owner self-review is not represented as a new sign-off.
- [x] No CodeQL alert was dismissed; all observed alerts were `fixed`.
- [x] No repository setting was changed.
- [x] Known branch-protection gaps and the absence of a second write maintainer remain documented in release notes.
- [x] Operator responsibilities and remaining limitations are explicit in [`../releases/v0.2.0.md`](../releases/v0.2.0.md).

## Publication

- [x] Release branch `release/v0.2.0` was based on the merged `main` commit `0b3ff8640abe29e46255257aa680b6e512137c7f`.
- [x] The release commit was pushed and verified through a pull request before tagging.
- [x] Annotated tag `v0.2.0` was created from the merged release commit and pushed to `origin`.
- [x] GitHub Release was published from [`../releases/v0.2.0.md`](../releases/v0.2.0.md).
- [x] No force-push, history rewrite, or destructive Git operation was used.
