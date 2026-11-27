# v0.1.0 release checklist

Use this checklist for the first GitHub release. Every item must be complete, explicitly waived by the repository owner, or moved to `docs/releases/v0.1.0.md` as a documented limitation before the tag is published.

> **Post-v0.1.0 status:** M11 hardening merged through PR #7 and M12 application runtime work merged through PR #9 are included in `v0.2.0`. See [`checklist-v0.2.0.md`](./checklist-v0.2.0.md) and [`../releases/v0.2.0.md`](../releases/v0.2.0.md). This file remains the historical `v0.1.0` record.

## Scope

- [x] Release scope is M1–M8, M9a, and M10 release work.
- [x] M9b restaurant demo is explicitly deferred and is not a release dependency.
- [x] E-commerce demo is the primary demonstration application.
- [x] No new shared modules, guest checkout, payments, Redis, multi-tenancy, or extra database engines were added.
- [x] No public API, SDK, or database contract was changed for the release.

## Fresh clone and setup

- [x] `pnpm install --frozen-lockfile` succeeds from a clean clone.
- [x] README provides Docker PostgreSQL setup and development-only credentials.
- [x] `pnpm db:migrate` succeeds on a fresh database.
- [x] A second `pnpm db:migrate` is a clean no-op.
- [x] `pnpm start` starts the composed backend with the example config.
- [x] `/health/live` and `/health/ready` return `ok`.
- [x] Register, login, `/auth/me`, and `/users/me` were exercised against the fresh instance.

Fresh-clone evidence: commit `a5fb7c3575cfafdfb454b6fc5df0db81efd5ce91`, 2026-11-24, Node 24 / pnpm 10.34.9, Docker PostgreSQL 16-alpine, 7 migrations applied then a no-op rerun.

## Verification

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm test:contract`
- [x] `pnpm openapi:check`
- [x] `pnpm sdk:check`
- [x] `pnpm demo:ecommerce:verify`
- [x] `pnpm config:docs` produces no committed reference drift
- [x] `pnpm audit --audit-level=high` passes
- [x] Final CI run is green on the release checklist commit; CI is rerun after any checklist change
- [x] Production demo build is verified (`pnpm --filter @skeletonstructure/demo-ecommerce build`)
- [x] Final migration/seed smoke test is recorded in the fresh-clone evidence above

## Security

- [x] Threat model checklist prepared at `docs/security/checklist.md`.
- [x] 0 high and 0 critical dependency advisories.
- [x] 3 moderate dev-only advisories recorded separately.
- [x] Native GitHub secret scanning and push protection enabled.
- [x] Dependabot security updates enabled.
- [x] Owner security sign-off recorded (`@MrUranium1`, "Approved — first release").
- [x] Owner self-review limitation recorded in release notes; separate second-maintainer review deferred.
- [x] Non-provider pattern scanning decision recorded in release notes.

## Documentation

- [x] README covers install, config, database, modules, start, health, demo, and limitations.
- [x] All documented module READMEs include config, permissions, and routes.
- [x] SDK source-only distribution is documented.
- [x] `SECURITY.md` includes private reporting, fallback email, limitations, and operator responsibilities.
- [x] Known limitations are collected in release notes.
- [x] `docs/releases/v0.1.0.md` is complete.
- [x] Website status matches the released implementation and the live site matches the repository.
- [x] Docs freeze commit is the commit containing this completed checklist.

## Release artifacts

- [x] `VERSION` is `0.1.0`.
- [x] Root and workspace package versions are `0.1.0`.
- [x] OpenAPI metadata is consistent with the release.
- [x] CHANGELOG has a `0.1.0` section.
- [x] Release notes explicitly state the project is not claimed to be completely secure.
- [x] Backend tree is clean and all commits are pushed.
- [x] Website tree is clean and all commits are pushed.
- [x] Tag `v0.1.0` publication command points to the docs-freeze commit.
- [x] GitHub Release content is ready at `docs/releases/v0.1.0.md`.
- [x] No npm publication is attempted.

The two publication steps below are executed immediately after this checklist commit passes CI.

## Publication command

```bash
git tag -a v0.1.0 -m "SkeletonStructure v0.1.0"
git push origin v0.1.0
```

Create the GitHub Release only after every blocking item above is complete. Never force-push.
