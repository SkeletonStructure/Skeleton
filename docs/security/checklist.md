# v0.1.0 security checklist

This checklist reviews the SkeletonStructure foundation against section 10 of the architecture blueprint. It is a review record, not a certification. SkeletonStructure must never be described as completely secure.

Release candidate reviewed: `a5fb7c3575cfafdfb454b6fc5df0db81efd5ce91` and later release-preparation commits up to the final docs-freeze commit.

## Review status

| Role               | Name         | Date       | Decision                          |
| ------------------ | ------------ | ---------- | --------------------------------- |
| Checklist preparer | Release work | 2026-11-24 | Prepared from repository evidence |
| Security reviewer  | @MrUranium1  | 2026-11-24 | Approved — first release          |

The repository owner supplied this sign-off directly. It is recorded as the v0.1.0 release decision. Because the reviewer is the owner rather than a separately identified second maintainer, the blueprint's independent-maintainer criterion is documented as an owner self-review limitation in the release notes rather than claimed as independently verified.

> The tables and sign-off below are the historical v0.1.0 review record. Unreleased M11 hardening in this working tree is listed in “Post-v0.1.0 M11 additions” at the end. It does not retroactively change the release decision or claim an independent review.

## Threat model review

| Threat area                                  | Implemented control                                                                                                                                | Evidence                                                                                                                                          | Residual risk or limitation                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Credential stuffing and brute force          | Argon2id hashing, 12-character minimum, constant-cost work for unknown emails, generic auth errors, stricter auth route limits                     | `packages/core/src/security/password.ts`, `packages/module-auth/src/service.ts`, `packages/module-auth/src/index.ts`, `docs/auth.md`              | No CAPTCHA, MFA, per-account limiter, or shared limiter; operators must monitor. Rate limits are per process.             |
| Session hijacking and fixation               | 32-byte opaque tokens, SHA-256 hashes at rest, httpOnly cookies, production `secure` validation, login rotation, server-side revocation            | `packages/core/src/security/tokens.ts`, `packages/module-auth/src/service.ts`, `docs/auth.md`                                                     | XSS in an application frontend can still act as the user.                                                                 |
| CSRF on cookie mutations                     | CSRF token required for unsafe methods when a session cookie is present; token stored as a hash and rotated by `/auth/me`                          | `packages/core/src/api/server.ts`, `packages/module-auth/src/service.ts`, `docs/auth.md`                                                          | Bearer clients intentionally skip cookie CSRF; SDK tokens remain in memory only.                                          |
| Vertical and horizontal privilege escalation | Deny-by-default permission guard, startup route/permission validation, ownership checks in use cases                                               | `packages/core/src/api/auth.ts`, `packages/core/src/api/config.ts`, `packages/module-users/src/index.ts`, `packages/module-orders/src/service.ts` | Roles are only as correct as assignment data; every new owned resource needs explicit rules.                              |
| SQL injection and mass assignment            | Drizzle parameterized queries, JSON Schema rejection of unknown write fields, allowlisted DTOs, DB constraints                                     | Module services and schemas under `packages/module-*/src/`, `docs/api.md`, `docs/database.md`                                                     | Reviewed raw SQL escapes remain possible; contributors must keep using tagged parameters.                                 |
| Client price tampering                       | Server-side `PriceResolverPort` is authoritative; order lines store immutable snapshots                                                            | `packages/module-orders/src/service.ts`, `docs/m8.md`                                                                                             | A deployment without a resolver is not storefront-grade checkout.                                                         |
| XSS                                          | API returns JSON; official examples use safe DOM APIs and never place tokens in browser storage                                                    | `docs/sdk.md`, `examples/`, `apps/demo-ecommerce/src/web/`                                                                                        | The foundation does not sanitize arbitrary HTML; there is no CMS.                                                         |
| CORS abuse                                   | Exact-origin allowlist, no wildcard with credentials, explicit `trustProxy`                                                                        | `packages/core/src/api/config.ts`, `packages/core/src/api/server.ts`, `docs/api.md`                                                               | A misconfigured allowlist can still trust a malicious origin.                                                             |
| Secret leakage                               | Env-only secrets, redacted config/health/startup output, gitignored `.env`, native GitHub secret scanning and push protection enabled              | `packages/core/src/config/`, `docs/config/reference.md`, `SECURITY.md`, repository security settings                                              | Non-provider pattern scanning is disabled; custom log calls and frontend code remain operator/developer responsibilities. |
| Password reset abuse                         | Hashed single-use tokens, 30-minute expiry, conditional update inside a transaction, revokes sessions, generic response, redacting console adapter | `packages/module-auth/src/service.ts`, `packages/module-auth/src/email.ts`, `docs/auth.md`                                                        | Console email is development-only; production needs a real adapter and delivery monitoring.                               |
| Dependency vulnerabilities                   | Lockfile, CI audit gate, Dependabot version and security updates, weekly update configuration                                                      | `.github/workflows/ci.yml`, `.github/dependabot.yml`, fresh `pnpm audit --audit-level=high`                                                       | Three moderate dev/transitive advisories remain; zero-days and future advisories always remain possible.                  |
| Error and log leakage                        | Fixed safe error messages, request IDs, no stack/SQL/config in responses, redaction defaults                                                       | `packages/core/src/api/errors.ts`, `packages/core/src/config/schema.ts`, `docs/api.md`                                                            | Fastify request logging is disabled; custom logging must follow the redaction rules.                                      |
| Migration accidents                          | Reviewed append-only SQL, advisory lock, explicit migration command, no auto-migrate on startup                                                    | `packages/core/src/database/`, `scripts/migrate-modules.mjs`, `docs/database.md`                                                                  | No destructive-migration tool or pending-migration readiness gate exists; human review remains required.                  |
| Payments and webhooks                        | No payment module, no card data, no webhook surface                                                                                                | `docs/m9.md`, ADR 0007                                                                                                                            | Payment work is out of scope for v0.1.0; a future design must use provider-hosted checkout, signatures, and dedupe.       |
| File uploads                                 | No upload surface                                                                                                                                  | Repository layout and route tables                                                                                                                | Future uploads need strict limits, random names, private access, and review.                                              |

## Dependency audit

Fresh `pnpm audit --audit-level=high` result on 2026-11-24:

```text
3 vulnerabilities found
Severity: 3 moderate
```

`pnpm audit --json`: 0 info, 0 low, 3 moderate, 0 high, 0 critical.

Moderate findings, all transitive development/test dependencies:

1. `esbuild` `GHSA-67mh-4wv8-2f99` via `drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils`. Development-server CORS/source exposure.
2. `glob` `GHSA-3g3m-2fjr-6pw4` via `testcontainers > archiver > archiver-utils`. Abort-signal cancellation bypass.
3. `minimatch` `GHSA-g3hv-75wg-m249` via the same Testcontainers chain. Glob-pattern amplification denial of service.

Release decision: these do not block v0.1.0 because no high or critical advisory exists and the affected packages are not runtime server dependencies. Track cleanup in a subsequent release.

## Secret scanning

Repository settings verified on 2026-11-24:

- GitHub secret scanning: enabled.
- Secret scanning push protection: enabled.
- Dependabot security updates: enabled.
- GitHub non-provider pattern scanning: disabled.
- Secret scanning validity checks: disabled.

Native secret scanning satisfies the v0.1.0 secret-scan check. Enabling non-provider patterns and adding a dedicated CI secret scanner are post-release improvements, not v0.1.0 blockers.

## Authentication and authorization correctness

Reviewed against tests and implementation:

- Password hashing uses Argon2id with explicit parameters and rehash-on-login support.
- Session tokens are opaque, 32 random bytes, and stored only as SHA-256 hashes.
- Login rotates the presented session token; logout deletes it; reset confirmation revokes all sessions.
- CSRF is enforced for cookie-authenticated unsafe methods; bearer clients are intentionally exempt.
- Reset tokens are hashed, short-lived, single-use, and updated conditionally in a transaction.
- Permissions are registered before routes and validated at startup; the global guard denies by default.
- User ownership checks are in use cases, and orders use the `BuyerContextPort` with user-only buyer refs.
- Integration tests cover anonymous, owner, non-owner, role, disabled-module, CSRF replay, reset replay, and session rotation cases.

No serious code-level authentication or authorization defect was found in this review.

## Database and transaction safety

- One shared PostgreSQL pool; modules cannot create their own pools.
- `initializeDatabase()` verifies connectivity and fails closed.
- Migrations use reviewed SQL, an advisory lock, and explicit commands.
- Order creation runs in a transaction with idempotency constraints and immutable snapshots.
- Checkout clears the cart after order persistence and preserves a retry-safe result.

Fresh clone verification applied migrations twice: seven migrations on the first run, then a clean no-op. No destructive database change was made.

## Production configuration defaults

- `NODE_ENV=production` requires a secure session cookie.
- CORS allows only exact configured origins; wildcard-with-credentials is rejected.
- Secrets are env-only and absent from public config, health output, and generated artifacts.
- The sample config is development-oriented and must be replaced for deployment.
- Operators are responsible for TLS, least-privilege database roles, backups, dependency updates, and monitoring.

## Post-v0.1.0 M11 additions

These controls are present in the current working tree but are not part of the tagged `v0.1.0` review. They have no new independent sign-off.

| Control                         | Implementation                                                                                                                                                  | Residual risk or owner action                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared rate-limit storage       | Core `RateLimitStoreProvider`; in-memory default; optional injected ioredis-compatible client; `skipOnError: false`; limiter registered before CSRF/auth hooks. | No Redis dependency or client is bundled. Applications must inject a provider and set `RATE_LIMIT_STORE=redis`; per-account limits, CAPTCHA, and MFA remain absent. |
| Persistent audit events         | `core_audit_events`, append-only triggers, validated core sink, transaction-bound auth/users events, and a named readiness check.                               | A schema owner can disable triggers. Retention and controlled deletion remain operator procedures; no hash chain or external WORM store is claimed.                 |
| Structured logging              | Core `logger` with level filtering, JSON/pretty formats, recursive redaction, child request bindings, and safe bounded fields.                                  | Applications that replace the logger must preserve redaction. Operators own shipping, retention, and access control for log output.                                 |
| Lifecycle and shutdown          | `starting → ready → draining → closed`, readiness during drain, one-shot close with a 10-second default timeout, original signal re-raise.                      | Slow dependencies can force `SIGKILL` at the timeout; tune the timeout and monitor shutdown logs.                                                                   |
| Security infrastructure failure | Rate-limit and audit failures fail closed; exceptions are mapped to safe `500`/`503` reason codes with no exception text.                                       | Availability of optional infrastructure now directly affects request availability; monitor readiness reasons and runbooks.                                          |

CodeQL findings #4 and #5 were still open when this branch was prepared. M11 addresses the code pattern by registering the limiter before the relevant hooks, but no alert was dismissed. Re-query GitHub after merge and have the owner record fresh triage; see [`github-governance.md`](./github-governance.md).

## Reviewer sign-off

```text
Reviewed by: @MrUranium1
Date: 2026-11-24
Decision: Approved — first release
Exceptions or follow-ups: Owner self-review; a separate second-maintainer review is deferred to a later release.
```

The `v0.1.0` tag may be created now that this sign-off and the release checklist are complete, with the owner self-review limitation recorded in the release notes.
