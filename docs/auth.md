# Authentication and authorization

M6 adds two optional, statically composed modules:

- `@skeletonstructure/module-users` owns user identity, profile data, roles, and permission grants.
- `@skeletonstructure/module-auth` owns sessions, password hashing, CSRF, password reset, and the public auth routes.

Core still owns only infrastructure. It exports security primitives through `@skeletonstructure/core/security`, but it never imports an application module.

## Composition

Enable both modules in config. `auth` requires `users`; the registry fails startup if `auth` is enabled without it.

```ts
import { createServer } from '@skeletonstructure/core/api';
import { loadConfig } from '@skeletonstructure/core/config';
import { initializeDatabase } from '@skeletonstructure/core/database';
import {
  createAuthUsersComposition,
  createConsoleEmailProvider,
  runAuthUsersMigrations,
} from '@skeletonstructure/module-auth';

const appConfig = await loadConfig();
const database = await initializeDatabase(appConfig.database);
await runAuthUsersMigrations(database);

const composition = await createAuthUsersComposition({
  appConfig,
  database,
  emailProvider: createConsoleEmailProvider(),
});

const app = await createServer({
  appConfig,
  database,
  activationReport: composition.activationReport,
  routeHandlers: composition.routeHandlers,
  authenticator: composition.authenticator,
  csrfGuard: composition.csrfGuard,
});
```

If either module is disabled, its routes are absent. They do not become public. Auth-only routes (`POST /auth/logout`, `GET /auth/me`) use the M5 `requireAuth` route flag; permissioned routes use the M5 global permission guard.

## Routes

| Method  | Path                              | Auth                           | Rate limited |
| ------- | --------------------------------- | ------------------------------ | ------------ |
| `POST`  | `/v1/auth/register`               | No                             | Yes          |
| `POST`  | `/v1/auth/login`                  | No                             | Yes          |
| `POST`  | `/v1/auth/logout`                 | Yes                            | No           |
| `GET`   | `/v1/auth/me`                     | Yes                            | No           |
| `POST`  | `/v1/auth/password-reset/request` | No                             | Yes          |
| `POST`  | `/v1/auth/password-reset/confirm` | No                             | Yes          |
| `GET`   | `/v1/users/me`                    | Permission `users:read:self`   | No           |
| `PATCH` | `/v1/users/me`                    | Permission `users:update:self` | No           |

Successful auth responses return only the user and a short-lived CSRF token in `data`. Session tokens are delivered exclusively through the `Set-Cookie` header; they are never placed in response bodies, logs, or error messages.

## Sessions and cookies

- Tokens are 32 random bytes encoded as URL-safe base64.
- Only the SHA-256 hash is stored in `auth_sessions`; plaintext never reaches the database.
- The cookie is named `skel_session`, is `httpOnly`, uses the configured `sameSite`, and is `secure` in production. Production config validation fails if the cookie is not secure.
- Login rotates the presenter's session token in the same transaction that creates the new session. Password-reset confirmation revokes all existing sessions and creates one fresh session.
- Logout revokes the current session and clears the cookie.
- Authenticated requests perform one indexed session lookup and one user lookup. This is the documented per-request database cost of opaque sessions in v0.1; there is no in-memory session cache.
- `last_seen_at` is updated on authenticated requests.

Run the explicit cleanup job to remove expired sessions and used/expired reset tokens:

```bash
pnpm auth:cleanup
```

The job is safe to run repeatedly.

## CSRF

Cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests must include the current CSRF token in `x-csrf-token`. The server stores only a hash of that token. `GET /auth/me` rotates the CSRF token, which invalidates previously issued tokens for the same session.

Bearer-authenticated requests are not subject to the cookie CSRF check. Non-browser clients can bootstrap a bearer session from the `Set-Cookie` header returned by login; the server accepts the opaque token in `Authorization: Bearer <token>` and maps it to the same session store. Browser SDKs should use `credentials: 'include'` and never store tokens in `localStorage`.

## Passwords and password reset

Passwords are hashed with Argon2id (`m=19456`, `t=2`, `p=1`, 32-byte output). Login verifies one Argon2id hash for both known and unknown emails and returns the same generic `401 UNAUTHENTICATED` message. Hashes are re-hashed on login if the policy changes.

Password reset:

1. `POST /auth/password-reset/request` always returns the same `200` message and always performs one dummy Argon2id verification regardless of whether the account exists.
2. For existing accounts, a single-use token is stored as a SHA-256 hash with a 30-minute expiry. Previous unused reset tokens for that user are deleted in the same transaction.
3. The `EmailProvider` port receives a password-reset message. The console adapter logs only recipient, template id, and delivery status; it never logs bodies, links, or tokens. Tests use an in-memory provider.
4. `POST /auth/password-reset/confirm` marks the token used with a conditional SQL `UPDATE ... WHERE used_at IS NULL AND expires_at > now()` inside a transaction. Only one concurrent confirmation can succeed. The same transaction updates the password, revokes every existing session, and creates the replacement session.

The reset request response and email metadata do not reveal account existence. Email bodies differ only because a real account must receive a usable token.

## Authorization model

Roles and permissions are separate data:

- `users_user_roles` assigns roles to users.
- `users_role_permissions` grants permissions to roles.
- `users_users` owns profile and password hash data.

Permission checks are enforced by the M5 global guard before a handler runs. Ownership checks are explicit use-case logic in `UsersService.getOwnedProfile()` and `updateOwnedProfile()`. Owning a resource never grants unrestricted access by itself, and a role permission never bypasses an ownership check. The default `user` role starts with `users:read:self` and `users:update:self`.

M8 reuses the authenticated principal through `BuyerContextPort`: `auth.currentBuyer()` returns `{ kind: 'user', id }` and `owns()` compares that ref with an order's stored buyer ref. `orders` depends only on the port, never on `auth` or `users` internals, and the `orders_orders.buyer_kind` check rejects guest refs in v0.1.

Integration tests exercise an authorization matrix covering anonymous, owner, non-owner, role A, and role B cases.

## Testing notes

- Unit tests: `packages/core/tests/security/`, `packages/module-users/tests/*.unit.test.ts`, `packages/module-auth/tests/auth.unit.test.ts`.
- Integration tests use Fastify `inject` and Testcontainers PostgreSQL: `packages/core/tests/api/auth-required.integration.test.ts`, `packages/module-users/tests/users.integration.test.ts`, `packages/module-auth/tests/auth.integration.test.ts`.
- Security cases covered: session rotation, session fixation on login, CSRF missing/invalid/replay, bearer bypass of cookie CSRF, token-at-rest hashing, reset token replay/expiry/concurrency, generic auth failures, cookie flags, rate limits, disabled-route behavior, and the authz matrix.
