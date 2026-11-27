# Ecosystem

This section separates verified implementation from documented intention. Do not assume an application exists because it was discussed.

Some items below are dated observations from sibling workspaces, archives, the website repository, or GitHub rather than files in this repository. They are institutional context; verify availability and current state before treating them as authority.

## Foundation distribution

- The implementation is the `SkeletonStructure/SkeletonStructure` monorepo; the git remote `Skeleton.git` redirects there.
- All packages/apps are private and version `0.1.0`. The SDK and server are source/workspace distributed; no npm publication is part of v0.1.0.
- A source archive `Skeleton-0.1.0.zip` exists outside the repository; provenance to one exact commit is not documented in repository docs.
- The public documentation site is a separate static git repository. An older local `SkeletonStructure` snapshot is static and has no git history.
- The sibling blueprint workspace is planning-only and stale; it is not an implementation repository.

## Independent application pattern

Applications are expected to:

1. Start from the released foundation or a fork pinned to a release.
2. Compose shared modules explicitly through `app-composition`.
3. Add domain logic as app-local modules via `additionalModules`.
4. Own their config, secrets, database, migrations, frontend, and deployment.
5. Use the shared SDK for public shared routes and an app-local client for app-only routes.
6. Avoid editing shared packages to discover application code.

Intentional boundaries:

- One database per application deployment, not a shared multi-app database.
- Exact CORS origins between separate frontend/backend dev servers.
- App-local tables are app-prefixed.
- Demo-local cart and future menu/branches stay out of `packages/` and the public SDK.
- Applications communicate over HTTP/SDK or explicit server composition, not module internals.

## Verified dependent example: Marginalia Books / bookstore

A sibling local `bookstore` workspace is the concrete integration example:

- `bookstore/README.md` identifies approved base as annotated tag `v0.1.0` (commit `9d665ff`) and states shared packages are unchanged; application code is app-local.
- `bookstore/skeleton-backend` is a foundation clone with branch `bookstore/integration`; its application code is uncommitted in the local workspace.
- `apps/bookstore/src/server/composition.ts` calls `createM8Composition()` with `additionalModules: [books.definition, cart.definition]` and runs shared M8 migrations before app-local books/cart migrations.
- App-local migrations create `bookstore_books`, `bookstore_carts`, `bookstore_cart_items`, and `bookstore_order_shipping` tables.
- The app config sets its own name, CORS origin, enabled modules, and env-based secrets.
- The frontend is a standalone Vite/React package configured by `VITE_API_BASE_URL` and `VITE_STORE_NAME`; UI code imports one service boundary that handles cookies, CSRF, and idempotency keys.
- Separate databases `bookstore` and `bookstore_test` are documented; this is separate deployment, not multi-tenancy.

Coupling risks observed locally, not necessarily defects:

- Bookstore backend has no committed application history; it is a fork with uncommitted app code.
- It is pinned to `v0.1.0` and does not inherit post-tag fixes; remote `main` was re-verified at `9f14557` after PR #9 on 2026-11-27.
- Its CI script still ends with demo checks and does not include bookstore verification; workflow is unchanged from v0.1.0.
- Local `.env` files and embedded PostgreSQL data exist; never copy them into the foundation.
- No production deployment manifests were found.
- Bookstore is not referenced by the foundation repo, release notes, or docs site; treat it as a local integration example, not an official published app.

## Orgo

**No Orgo implementation or reference was found** in the inspected workspace, including source, docs, git trees, commit messages, branches, tags, reflogs, the blueprint, and the website repositories. Do not describe Orgo as an implemented app, package, repo, or planned milestone unless a user supplies a source. If the user means a specific Orgo project, ask for its location before writing about it.

## Versioning and upgrades

- Blueprint specifies SemVer 2.0: additive minor, removals/breaks major or explicitly flagged, deprecations retained one minor, reviewed append-only migrations, OpenAPI versioned with release, SDK version follows server minor compatibility.
- `CHANGELOG.md` follows Keep a Changelog. v0.1.0 is the first tagged baseline; there is no earlier released schema to upgrade from.
- Compatibility baselines freeze v0.1.0 operations, migration hashes, and an empty allowlist.
- No concrete procedure for rebasing or merging an application fork from v0.1.0 to a future release was found. Treat upgrade mechanics as unresolved; verify against both repos before advising.

## Website boundary

- `SkeletonStructure.github.io` is the current published documentation site and is a separate git repo.
- It states v0.1.0 is released, the project is under active development, and it is not production-ready.
- Backend work must not modify the website as part of unrelated tasks; documentation links may need manual coordination.
