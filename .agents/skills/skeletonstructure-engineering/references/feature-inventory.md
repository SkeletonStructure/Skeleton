# Feature inventory

Dated snapshot: **2026-11-27**. This is a quick map of what exists, not a substitute for reading the implementation. Verify against source before relying on a status, especially after dependency bumps or post-release commits.

Status meanings:

- **Implemented** — present in the repository and covered by the relevant checks.
- **Partial** — useful seam exists, but the full capability is intentionally limited.
- **Planned/Deferred** — documented intention; not evidence of implementation.
- **Absent** — explicitly out of scope in v0.1.0 or not found in the repository.
- **Unverified** — external or sibling-workspace claim; confirm before relying on it.

| Capability                                      | Status                   | Evidence / starting points                                                                          | Notes                                                                                                               |
| ----------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| pnpm monorepo and strict TypeScript             | Implemented              | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`                                         | `templates/*` is configured but absent in this tree.                                                                |
| Configuration and secrets                       | Implemented              | `packages/core/src/config/`, `docs/config/`                                                         | Env precedence, Zod validation, redaction. `SESSION_SECRET` declared but no consumer found.                         |
| Shared PostgreSQL and migrations                | Implemented              | `packages/core/src/database/`, module migration folders, `docs/compatibility/`                      | One pool; advisory-locked, explicit migrations; no auto-migrate.                                                    |
| Explicit module registry and static composition | Implemented              | `packages/core/src/modules/`, `packages/app-composition/src/`                                       | No disk discovery; ports and `additionalModules` are explicit.                                                      |
| API infrastructure                              | Implemented              | `packages/core/src/api/`, `openapi/openapi.json`                                                    | `/v1`, envelopes, errors, request IDs, permissions, CSRF hook, exact CORS, health, request-scoped structured logs.  |
| Auth and users                                  | Implemented              | `packages/module-auth/`, `packages/module-users/`                                                   | Argon2id, opaque hashed sessions, CSRF, single-use resets, console email adapter.                                   |
| Catalog, products, inventory, orders            | Implemented              | `packages/module-catalog/`, `module-products/`, `module-inventory/`, `module-orders/`               | Ports, server-authoritative prices, immutable snapshots, transactional idempotency.                                 |
| Generated public SDK                            | Implemented              | `packages/sdk/`, `scripts/generate-sdk.mjs`, `docs/sdk.md`                                          | Generated types + thin client; no runtime dependencies; no npm publication.                                         |
| M9a e-commerce demo                             | Implemented              | `apps/demo-ecommerce/`, `docs/m9.md`                                                                | App-local cart; checkout stops at order confirmation; no payment captured.                                          |
| M9b restaurant demo                             | Planned/Deferred         | `docs/m9.md`, blueprint                                                                             | Not started. Do not report as current work.                                                                         |
| Layered QA, CI, compatibility baselines         | Implemented              | `.github/workflows/ci.yml`, `docs/quality-assurance.md`, `tests/regression/`, `docs/compatibility/` | Post-tag hardening; requires Docker for some layers.                                                                |
| v0.1.0 release                                  | Implemented              | `CHANGELOG.md`, `docs/releases/v0.1.0.md`, tag `v0.1.0`                                             | First usable release, not production-ready beyond tested scope.                                                     |
| Structured logging and graceful shutdown        | Implemented              | `packages/core/src/logging/`, `packages/core/src/lifecycle/`, ADRs 0011/0012                        | Merged through PR #7 after `v0.1.0` with no separate tag; config-driven logger with redaction and bounded shutdown. |
| Payments, refunds, cancellations, stock release | Deferred                 | `docs/m9.md`, `docs/releases/v0.1.0.md`                                                             | Payment seam/ADR not accepted; no payment implementation.                                                           |
| Real email adapter                              | Partial                  | `packages/module-auth/src/email.ts`                                                                 | Console adapter only; no bodies, links, or tokens logged.                                                           |
| Shared/Redis rate limiting                      | Implemented              | `packages/core/src/api/rate-limit.ts`, `packages/core/src/api/server.ts`, ADR 0008                  | Memory default; optional injected ioredis-compatible client; no Redis dependency; fails closed.                     |
| MFA, OAuth, CAPTCHA                             | Absent                   | `README.md`, `docs/releases/v0.1.0.md`                                                              | Do not claim implemented.                                                                                           |
| Persistent audit logging                        | Implemented              | `core_audit_events`, `packages/core/src/database/audit.ts`, ADRs 0009/0010                          | Append-only table, validated sink, transaction-bound auth/users events, readiness check.                            |
| Multi-tenancy                                   | Absent                   | blueprint D-10, release notes                                                                       | v0.1.0 is single-tenant.                                                                                            |
| Production deployment manifests                 | Absent                   | repository search                                                                                   | Operator guidance exists; manifests do not.                                                                         |
| Dependent application: bookstore                | Unverified local example | sibling local `bookstore` workspace                                                                 | App-local books/cart, pinned to v0.1.0, not upstream-documented.                                                    |
| Orgo                                            | Unverified / not found   | repository, docs, history, sibling workspaces searched                                              | No implementation or reference found; ask for a source before discussing it.                                        |

## Maintenance

When a feature is added, removed, renamed, activated, or deferred:

1. Update this table and [current-state.md](current-state.md).
2. Update [architecture.md](architecture.md), [security.md](security.md), [testing-and-quality.md](testing-and-quality.md), [known-limitations.md](known-limitations.md), or [roadmap.md](roadmap.md) as affected.
3. Mark replaced architectural decisions `Superseded` in [architectural-decisions.md](architectural-decisions.md); preserve history and link the replacement.
4. Do not silently change the long-term vision or established principles.
