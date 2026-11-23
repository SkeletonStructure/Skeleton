# ADR 0003 — Opaque server-side sessions and explicit authorization

- Date: 2026-11-23
- Status: accepted
- Milestone: M6

## Context

M5 defines an `Authenticator` seam and a global permission guard but deliberately implements no authentication. M6 must add login, logout, current-user, password reset, CSRF protection, roles/permissions, and session cleanup without pulling application concerns into core or substituting JWTs. The approved blueprint requires opaque server-side database sessions, token hashes at rest, httpOnly cookies, rotation on login, short-lived single-use reset tokens, generic errors, and deny-by-default authorization.

## Decision

Core exports only security primitives (`hashPassword`, `verifyPassword`, token generation/hashing, timing-safe comparison) from `@skeletonstructure/core/security`. Two optional modules implement behavior:

- `users` owns `users_users`, `users_user_roles`, and `users_role_permissions`. Roles grant permissions; profiles expose only identity and resolved roles/permissions.
- `auth` owns `auth_sessions` and `auth_password_reset_tokens`, consumes a stable `EmailProvider` port, and supplies the M5 `Authenticator` and an injectable CSRF guard.

Session tokens are 32 random bytes in URL-safe base64. Only their SHA-256 hashes are stored. Cookies are httpOnly, use configured `sameSite`, and are secure in production. Login rotates any presented session token inside the same transaction that creates the new session. Password-reset confirmation conditionally marks a token used, updates the password, revokes all sessions, and creates a replacement session in one transaction. Expired sessions and finished reset tokens are removed by an explicit cleanup job.

Passwords use Argon2id with explicit, reviewable parameters and rehash on login when parameters change. Login and reset failures return generic messages; unknown emails perform one dummy Argon2id verification. Reset tokens expire after 30 minutes and are single-use. The console email adapter logs only recipient, template id, and status.

Authorization is deny-by-default. Permission checks are enforced by the M5 global hook before handlers run. Ownership checks are separate use-case logic and are never implied by a permission grant or resource ownership. M6's additive `requireAuth` route flag covers auth-only endpoints without inventing a permission key. Disabled modules register no routes, so protected routes disappear rather than becoming public.

## Alternatives considered

1. Stateless JWT access tokens: rejected because revocation, rotation, and secret distribution add complexity; opaque sessions are easier to reason about and revoke.
2. Storing plaintext tokens or reset links: rejected because database exposure would allow immediate account takeover.
3. Returning session tokens in response bodies: rejected because browser clients should use httpOnly cookies. Non-browser clients can read the `Set-Cookie` header and send the token as a bearer credential.
4. Treating ownership as a role or deriving permissions from ownership: rejected because it hides authorization rules and fails deny-by-default review.
5. Skipping CSRF for cookie mutations because `sameSite=lax` is set: rejected because CORS does not replace CSRF and operators may change same-site policy.

## Consequences

- Every authenticated request costs one indexed session lookup plus one user lookup; there is no in-memory session cache in v0.1.
- The session and reset-token tables grow until the cleanup job runs.
- Non-browser clients must bootstrap bearer tokens from the login `Set-Cookie` header.
- Per-process rate limiting and the console email adapter remain development-grade; production needs shared limiting and a real email provider.
- Password-reset email metadata is identical for known and unknown accounts, but real accounts receive a usable token in the message body by necessity.

## Verification

Unit tests cover Argon2id behavior, token primitives, module config, route declarations, disabled-module behavior, and email redaction. PostgreSQL/Fastify integration tests cover register/login/logout/`/auth/me`, cookie flags, hashed-at-rest tokens, session rotation and fixation, CSRF missing/invalid/replay, bearer behavior, generic auth failures, reset token hashing/single-use/expiry/concurrency, rate limits, cleanup, and an anonymous/owner/non-owner/role-A/role-B authorization matrix. CI runs Node 24, type-check, lint, OpenAPI freshness, all tests, and a high-level dependency audit.
