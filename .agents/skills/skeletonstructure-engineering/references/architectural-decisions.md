# Architectural decisions

Record important decisions in ADR style. Do not turn temporary implementation choices into permanent rules. When an old record is stale, say so; do not silently rewrite history.

## Authority and status

- `docs/architecture/adr/0001`–`0013` are accepted implementation ADRs; ADRs 0008–0012 (PR #7) and ADR 0013 (PR #9) are included in `v0.2.0` without changing the historical `v0.1.0` record.
- `SkeletonStructure-blueprint/ARCHITECTURE_BLUEPRINT.md` records approved bootstrap decisions D-01–D-14. It lives outside this repository, has not been imported into `docs/architecture/`, predates implementation, and contains stale status text. If it is unavailable, use `docs/architecture/README.md` and the accepted ADRs as the in-repo record.
- Release scope narrowed after blueprint approval: M9b was deferred. No detailed ADR records that change.
- Future significant decisions need their own ADR and human approval.

## Status values and superseding

Use explicit status values: **Accepted**, **Superseded**, **Rejected**, **Deferred**, or **Under review**. Existing records with older wording remain historical evidence.

When an accepted decision is replaced:

1. Keep the original record; do not delete or silently rewrite it.
2. Change its status to `Superseded` with a direct link to the replacement and a short reason/date.
3. Create the replacement record with context, decision, reasoning, consequences, and a link back to the superseded record.
4. Update [current-state.md](current-state.md), [feature-inventory.md](feature-inventory.md), and affected architecture/security/testing docs in the same change.

Never mark a decision superseded merely because an implementation detail evolved. A stale detail inside an accepted ADR should be annotated as historical, as done for ADR 0002 and ADR 0004, while the decision itself remains accepted. Never silently rewrite established principles or the long-term vision; those changes require human approval.

## Blueprint decisions (historical approval, current boundaries)

| ID   | Decision                                         | Current consequence                                                          |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| D-01 | Modular monolith                                 | Keep shared capabilities in one explicit foundation, not many repos.         |
| D-02 | Technology stack                                 | TypeScript/Fastify/Drizzle/PostgreSQL/Zod/Vitest/Biome/pnpm are established. |
| D-03 | Config file + env secrets                        | Use `defineConfig()` and `env(...)`; never literal secrets.                  |
| D-04 | Module contract + registry                       | Explicit `ModuleDefinition`; no disk discovery.                              |
| D-05 | Opaque server-side sessions                      | Do not switch to JWT/stateless sessions without an ADR.                      |
| D-06 | OpenAPI artifact + thin SDK                      | Generate artifacts; keep SDK browser-safe.                                   |
| D-07 | Narrow DB port, PostgreSQL-only                  | One shared pool; no module-owned pools or extra engines in v0.1.0.           |
| D-08 | Monorepo with packages                           | Keep private workspace packages; no per-module repos.                        |
| D-09 | Catalog core with domain extensions              | Domain details live in extensions, not generic catalog core.                 |
| D-10 | Single-tenant v0.1                               | Multi-tenancy is deferred.                                                   |
| D-11 | Website/organization boundary                    | Static site stays separate; do not rewrite it from backend work.             |
| D-12 | Catalog extension design                         | Extensions own tables/snapshots and use generic expansion.                   |
| D-13 | Demo sequencing                                  | M9a e-commerce first; M9b restaurant later and explicitly approved.          |
| D-14 | Immutable order snapshots + guest ownership seam | Snapshots are immutable; guest buyer ref exists but is rejected in v0.1.0.   |

## ADR 0001 — Explicit module registry

- **Context:** Dynamic plugin discovery would make dependencies and activation unpredictable.
- **Decision:** Use a checked-in module list and explicit dependency/port declarations; never import concrete modules from core or discover modules from disk.
- **Reasoning:** Predictable startup, validated graph, reviewable composition.
- **Consequences:** Adding a module requires composition changes; app-local providers use `additionalModules`, not discovery.
- **Status:** Accepted.

## ADR 0002 — API infrastructure boundary

- **Context:** Core must provide consistent HTTP behavior without owning module semantics.
- **Decision:** Core owns one Fastify instance, request IDs, permission guard, envelope/error handling, health, public config allowlist, and generated OpenAPI. Routes/handlers come from the activation report.
- **Reasoning:** Uniform contract and centralized security enforcement.
- **Consequences:** Internal surfaces must stay out of public OpenAPI; startup validation rejects ambiguous or undeclared routes/permissions.
- **Status:** Accepted. Note: the ADR's statement that OpenAPI contains only `/v1/config/public` was true at M5 and is stale; current artifact has 21 operations.

## ADR 0003 — Opaque sessions and authorization

- **Context:** Browser sessions need safe storage, revocation, CSRF protection, and deny-by-default authorization.
- **Decision:** Argon2id passwords, 32-byte opaque session tokens stored only as SHA-256 hashes, httpOnly cookies, CSRF, single-use reset tokens, and permission checks in core.
- **Reasoning:** Avoid stateless token pitfalls; enable revocation and constant-time comparison.
- **Consequences:** Bearer clients are intentionally CSRF-exempt; reset confirmation revokes sessions; no MFA/OAuth in v0.1.0.
- **Status:** Accepted.

## ADR 0004 — OpenAPI-derived thin SDK

- **Context:** Frontend clients need typed access without depending on server internals.
- **Decision:** Generate TypeScript types from committed OpenAPI and maintain a thin hand-written `fetch` wrapper with typed errors.
- **Reasoning:** Deterministic generation, browser safety, no server imports.
- **Consequences:** Generated files must be regenerated and checked; SDK has no runtime dependencies and no persistent token storage.
- **Status:** Accepted. Note: the ADR's three-namespace description was true at M7 and is stale; current namespaces are config, auth, users, catalog, products, inventory, orders.

## ADR 0005 — M8 static composition and port ambiguity

- **Context:** Multiple providers could satisfy an optional port.
- **Decision:** `app-composition` owns checked-in M8 wiring and fails before listen on ambiguous price resolvers.
- **Reasoning:** Silent provider selection would be unsafe and hard to diagnose.
- **Consequences:** `AMBIGUOUS_PRICE_RESOLVER` names providers and app; `additionalModules` supports app-owned static providers.
- **Status:** Accepted.

## ADR 0006 — Generic catalog extensions and order snapshots

- **Context:** Different domains need different item details while orders must remain historically accurate.
- **Decision:** Generic catalog base plus extension loaders keyed by `kind`; extensions own their tables; order lines store immutable snapshots; core gains only generic cursor helpers.
- **Reasoning:** Avoid coupling catalog to every domain and avoid re-pricing old orders.
- **Consequences:** Domain-specific tables live with extensions; client-supplied amounts are rejected when a resolver exists.
- **Status:** Accepted.

## ADR 0007 — Demo-local cart and deferred payment seam

- **Context:** The storefront needs a cart, but cart is not yet a universal foundation capability.
- **Decision:** Keep cart in `apps/demo-ecommerce/modules/cart`; no `packages/module-cart`; no shared contract changes. Checkout stops at order confirmation; payment is deferred.
- **Reasoning:** Prove the foundation without prematurely generalizing a demo concern.
- **Consequences:** Cart routes/types must stay app-local; a future payment capability can key attempts to order id and idempotency key.
- **Status:** Accepted.

## Release-scope decision — M9b deferred

- **Context:** Blueprint's MVP definition of done included a restaurant demo; v0.1.0 release documentation excludes it.
- **Decision:** Ship M1–M8, M9a, and M10 as `v0.1.0`; defer M9b.
- **Reasoning:** Detailed rationale is not recorded beyond release scope; do not invent one.
- **Consequences:** `README.md` and release notes are authoritative for the shipped scope; blueprint status text is stale.
- **Status:** Effective release decision; unresolved documentation gap.

## Process decision — owner security sign-off

- **Context:** Blueprint expected review by a maintainer other than the author.
- **Decision:** Owner `@MrUranium1` recorded “Approved — first release”; independent second-maintainer review is deferred.
- **Reasoning:** Explicitly recorded as an owner self-review limitation, not independent verification.
- **Consequences:** Do not claim independent review; add a second maintainer if independent review is required.
- **Status:** Effective for v0.1.0 with documented limitation.

## Post-tag QA hardening

- **Context:** Independent QA identified compatibility, migration-safety, and verification gaps after v0.1.0.
- **Decision:** PR #1 added layered tests, compatibility baselines, linear parsing fixes, a migration CLI smoke gate, and CodeQL fixes without changing the tag.
- **Reasoning:** Strengthen CI while preserving released behavior.
- **Consequences:** `v0.1.0` remains the compatibility baseline; QA artifacts are post-release hardening.
- **Status:** Merged; not part of the tag.

## M11 security and operational hardening (merged)

- **Context:** Post-release work needed shared rate limiting, durable audit history, functional structured logging, predictable shutdown, and documented failure behavior without adding a default Redis dependency or changing public routes.
- **Decisions:** In-repo ADRs 0008–0012 record the rate-limit storage port, persistent audit logging, append-only audit integrity, structured logging/request correlation, and fail-closed security infrastructure behavior.
- **Reasoning:** Keep infrastructure in core, make optional providers explicit, preserve the v0.1.0 compatibility baseline, and prefer bounded deterministic failure over silent security weakening.
- **Consequences:** The default remains zero-configuration in-memory; shared Redis requires an injected client. Audit rows are append-only at the database privilege boundary. Logging is redacted and request-correlated. Shutdown drains readiness before a bounded close.
- **Status:** Accepted and merged on `main` through PR #7; included in `v0.2.0` without changing the historical `v0.1.0` tag. No earlier ADR is superseded.

## M12 application runtime and migration readiness (merged)

- **Context:** Applications duplicated startup and migration CLI wiring, and the configured `templates/*` workspace glob had no starter. Pending migrations needed a safe readiness signal without auto-migration or public contract changes.
- **Decision:** ADR 0013 accepts shared `startApplication()`/`runApplicationMigrations()` helpers, `templates/basic-app`, and an additive opt-in migration readiness helper with the fixed `MIGRATIONS_PENDING` reason.
- **Reasoning:** Reuse established seams and explicit module/migration lists; keep core free of concrete modules; keep migration execution an operator action; preserve the `v0.1.0` baseline.
- **Consequences:** New apps can adopt the foundation without modifying shared packages. Default startup and all public artifacts are unchanged; only apps that pass migration folders get the preflight.
- **Status:** Accepted and merged on `main` through PR #9 at `9f14557`; included in `v0.2.0` without changing the historical `v0.1.0` tag. No earlier ADR is superseded.
