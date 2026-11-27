# Project vision

## What SkeletonStructure is

SkeletonStructure is the engineering counterpart to the SkeletonStructure website: a reusable backend foundation from which independent applications can start instead of rebuilding common infrastructure. The implementation lives in the `SkeletonStructure/SkeletonStructure` monorepo (the git remote still uses the older `Skeleton.git` URL and redirects). `v0.1.0` is the first tagged release.

The foundation provides a modular TypeScript/Fastify server, PostgreSQL persistence, authentication and authorization, generic catalog/extensions, orders with transactional idempotency, a generated public HTTP contract, and a thin browser-safe client. Applications compose what they need and add their own domain locally.

## Why it exists

The recurring problem is that every new application repeats the same invisible work: configuration and secret handling, database lifecycle and migrations, API envelopes and errors, authentication, CSRF, permissions, generated clients, and test/CI discipline. Repeating that work is slow and produces inconsistent guarantees.

SkeletonStructure centralizes that common work in one foundation while keeping applications independent products. The foundation is not an application framework that owns application semantics; it is a checked-in, reviewable base with explicit seams.

## Confirmed scope of v0.1.0

Verified from `README.md`, `CHANGELOG.md`, `docs/releases/v0.1.0.md`, and the git history:

- M1–M10 are implemented: monorepo foundation, configuration, database, module registry, API infrastructure, auth/users, SDK, business modules, the M9a e-commerce demo, and release documentation.
- Six shared modules are enabled in the example configuration: `users`, `auth`, `catalog`, `products`, `inventory`, `orders`.
- `apps/demo-ecommerce` is the primary demonstration application.
- M9b (restaurant demonstration) is deliberately deferred.
- The SDK is source/workspace distributed; it is not published to npm.
- The release is explicitly **not** claimed to be completely secure or production-ready beyond the tested scope.

Absent by design in `v0.1.0`: payments, guest checkout, cancellations/refunds/stock release, MFA, OAuth, CAPTCHA, real SMTP/HTTP email, file uploads, webhooks, persistent audit logging, Redis/shared rate limiting, multi-tenancy, and additional database engines. Unreleased M11 work adds persistent audit events and shared rate-limit storage to the current tree without changing the tagged release or adding a default Redis service.

## Guiding direction

These are guiding principles from the approved blueprint and repository docs, not permission to assume implementation details:

- Build independent applications on top of the foundation instead of reinventing shared backend infrastructure.
- Keep applications independent products; do not make them tightly coupled to the foundation or to each other.
- Prefer modularity, maintainability, extensibility, and simplicity.
- Absorb complexity inside the foundation rather than exposing it to application developers.
- Reuse existing capabilities whenever appropriate.
- Integrate new functionality with established conventions.
- Keep the foundation useful for multiple independent applications over time.

When a principle conflicts with a concrete repository convention, verify the code and ask rather than improvising.

## Intended users and use cases

- **Foundation maintainers**: evolve core, shared modules, composition, SDK generation, QA, and release artifacts without breaking consumers.
- **Application teams**: start from the released foundation, enable needed modules, add app-local modules and migrations, and ship an independent backend and frontend.
- **Frontend developers**: consume the generated public API types and thin SDK for shared routes, plus an app-local client for app-only routes.
- **Operators**: run the built server with explicit configuration, managed secrets, an owned database, and explicit migrations.

## Relationship with independent applications

The intended pattern is additive composition:

- Applications reuse checked-in modules through `app-composition` and explicit `additionalModules`.
- Applications own their config, secrets, database, domain modules, migrations, routes, frontend, and deployment.
- Shared packages are not edited to discover application code.
- Demo-local or application-local concerns such as the e-commerce cart and the local bookstore books/cart stay outside `packages/`.
- Applications communicate with the backend over HTTP/SDK or explicit server composition; they do not import module internals.

See [ecosystem.md](ecosystem.md) for the verified dependent-application evidence and the unresolved Orgo question.

## Website boundary

The website/organization front door is a separate static repository. Backend work must not rewrite it. Linking documentation across the two places is accepted manual work; merging the website into the backend monorepo was rejected.

## Long-term direction, carefully stated

The documented direction is to keep proving the foundation with independent demonstrations and to add only capabilities that are designed, ADR-recorded where significant, tested, and released. M9b is the next explicitly named demonstration, but it is **planned/deferred**, not complete. M11 follows that pattern for security infrastructure with ADRs 0008–0012 on an unreleased branch. Payments, real email, per-account limits, and multi-tenancy remain future design work; shared rate-limit storage now has an accepted ADR and implementation, but no new release tag.

## Historical note

The blueprint was approved before backend code existed and still contains statements such as “No backend code has been written.” Those statements are historically true for that document but are stale for the current project. Treat the blueprint as design intent only.
