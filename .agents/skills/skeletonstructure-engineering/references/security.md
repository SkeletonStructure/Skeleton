# Security

Security guarantees are part of the foundation's identity. Never weaken authentication, authorization, validation, isolation, CSRF, session handling, or error hygiene to simplify an implementation.

## Reporting and release posture

- Vulnerabilities follow `SECURITY.md` private reporting; do not open public issues/PRs with exploit details.
- `v0.1.0` is the first usable release, not a claim of complete security or production readiness beyond tested scope.
- Owner security sign-off is self-review; independent second-maintainer review remains open.

## Authentication

- Passwords use Argon2id (`m=19456`, `t=2`, `p=1`, 32-byte output) via core security primitives; malformed hashes fail closed and rehash when policy changes.
- Login returns a generic `401 Invalid email or password.` and performs one Argon2id verification for known/unknown emails with a fixed dummy hash.
- Sessions are 32-byte opaque tokens; only SHA-256 hashes are stored in `auth_sessions`; comparisons use constant-time hashed `timingSafeEqual`.
- Login rotates the presented session token in a transaction; reset confirmation revokes all sessions; logout revokes the current session.
- Cookie `skel_session` is httpOnly with configured `sameSite`/`secure`; cookies are never returned in bodies. Production requires secure cookies.
- Presentation order is bearer token first, then cookie.
- `pnpm auth:cleanup` removes expired sessions and used/expired reset tokens.

## Authorization

- Core installs a root deny-by-default permission guard: no principal → `401`, missing permission → `403`.
- Startup validation rejects unknown route permissions, duplicate routes/handlers, missing/undeclared handlers, `/v1` prefixes in declarations, wildcard CORS with credentials, invalid rate limits, and reserved readiness IDs.
- Ownership is checked in use cases (`users`, `orders`, demo cart) and is distinct from role permissions.
- Orders resolve buyers only through `buyer-context@1`; guest buyer refs are rejected in v0.1.0; non-owner reads require `orders:read:any`.
- Demo cart buyer comes from authenticated context, never from route/body input.

## CSRF

- CSRF verification runs on `POST`, `PUT`, `PATCH`, `DELETE` when a guard is supplied.
- CSRF is required for session-cookie requests; bearer clients are intentionally exempt.
- Tokens are SHA-256 hashed at rest and compared in constant time.
- `GET /auth/me` rotates the CSRF token and invalidates prior tokens; the SDK updates its in-memory token after `getCurrentUser()`.
- Regression tests pin replay rejection after rotation.

## Password reset

- Reset tokens are hashed, single-use, and expire after 30 minutes.
- Requesting a reset deletes previous unused tokens in a transaction and returns a generic response regardless of account existence.
- Confirmation conditionally marks the token used, updates the password, revokes sessions, and creates a new session in one transaction.
- Console email adapter logs only recipient, template ID, and status — never bodies, links, or tokens. A real adapter is future work.

## Rate limiting

- Global `fastify/rate-limit`: enabled by default, 100 requests / 60s, `429 RATE_LIMITED`.
- The M11 core `RateLimitStoreProvider` defaults to an in-process map. `security.rateLimit.store = 'redis'` requires an application-injected ioredis-compatible client via `createRedisRateLimitStore()`; the foundation adds no Redis dependency and never creates a client.
- The limiter is registered after request correlation but before CSRF and permission hooks. `skipOnError: false` makes storage errors fail closed as `500 INTERNAL`; breaches return `429 RATE_LIMITED` and may create `security.rate_limit` audit failures.
- Auth routes (register, login, reset request/confirm) use stricter 10 / 60s limits; health probes are exempt.
- Per-account limits, CAPTCHA, and MFA remain absent. Two CodeQL `js/missing-rate-limiting` findings were open at M11 preparation; the code pattern is addressed but owner re-triage/dismissal after fresh evidence is still required. Do not dismiss automatically.

## Audit and operational failure behavior

- M11 adds `core_audit_events`, a core-owned append-only table with outcome constraints and database triggers against `UPDATE`/`DELETE`.
- `createDatabaseAuditSink()` validates action/outcome, request ID format, identifiers, and bounded primitive metadata. Identity-changing auth/users events use the domain transaction executor, so the event and state change commit or roll back together.
- Failed audit writes propagate before protected responses are returned. Readiness probes the audit table and reports `AUDIT_STORE_UNAVAILABLE` rather than relying only on `SELECT 1`.
- Rate-limit store and audit exceptions are normalized to safe reason codes; no exception text, credential, URL, or host detail is exposed.
- Structured logs use configured levels/formats/redaction and bind `requestId` to request logs. Log transport failures are isolated from request handling.
- Lifecycle transitions are monotonic; readiness is drained before close. Shutdown is one-shot, bounded by a default 10-second timeout, and re-raises the original signal.

## Validation and parsing

- Config uses Zod with aggregated startup errors and secret redaction.
- Fastify JSON schemas set `additionalProperties: false`; users PATCH allows one property; auth schemas bound email/password/token lengths.
- Orders validate 1–100 items, integer quantities, idempotency-key format, and reject client amounts when a resolver exists.
- Linear parsing fixes cover email validation (preserving v0.1.0 acceptance), bearer headers, and SDK base URL normalization. Keep these regressions passing.
- API errors use fixed safe messages, request IDs, and no stack/SQL/config leakage. SDK errors sanitize unknown text.

## Database safety

- One shared pool; modules must not create pools.
- Drizzle parameterized queries; no destructive DDL in committed migrations.
- Migrations use advisory locks and explicit operator invocation; never auto-migrate in production startup.
- v0.1.0 migration hashes are pinned; append new migrations only.
- Keep ownership, uniqueness, non-negative stock/price, buyer-kind, status, and idempotency constraints intact.

## Secrets and configuration

- Secrets come from env via `env(...)`; never commit `.env` or literal `database.url`.
- Production requires secure cookies, JSON logs, CSRF enabled, exact CORS origins, and protected redaction defaults.
- Least-privilege DB role, TLS/secret management, backups, and updates are operator responsibilities.
- GitHub secret scanning and push protection were observed enabled on 2026-11-27, with non-provider patterns and validity checks disabled; re-query GitHub before relying on that state. There is no dedicated CI secret scanner.

## Known gaps to preserve honestly

No MFA/OAuth/CAPTCHA, no real email adapter, no per-account limiter, no multi-tenancy, no payment/cancellation/refund flow, and no production deployment manifests. M11 adds persistent audit logging and a shared-limiter seam in unreleased code; Redis still requires an injected client. Do not describe v0.1.0 as having these M11 controls.
