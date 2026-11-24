# `@skeletonstructure/module-auth`

Optional M6 module for authentication and session management. It requires `users` and provides the `buyer-context@1` port used by `orders`.

## Configuration and dependencies

```ts
modules: {
  users: { enabled: true, allowSelfUpdate: true };
  auth: {
    enabled: true,
    passwordMinLength: 12;
  };
}

providers: {
  email: { driver: 'console' };
}
```

`passwordMinLength` defaults to 12 and cannot be configured below 12. Session cookie, CSRF, and CORS behavior comes from `appConfig.security`; the provider setting selects the `EmailProvider`. The console adapter is development-only and logs only recipient, template id, and delivery status.

`auth` has a hard dependency on `users`. Startup fails if `auth` is enabled without `users`.

## Permissions

The module owns no permission keys. Its public routes are either anonymous or use the M5 `requireAuth` flag. Authorization data and the `users:*` permissions come from `users`.

## Routes

| Method | Path                              | Access  | Rate limit |
| ------ | --------------------------------- | ------- | ---------- |
| `POST` | `/v1/auth/register`               | Public  | 10/minute  |
| `POST` | `/v1/auth/login`                  | Public  | 10/minute  |
| `POST` | `/v1/auth/logout`                 | Session | Global     |
| `GET`  | `/v1/auth/me`                     | Session | Global     |
| `POST` | `/v1/auth/password-reset/request` | Public  | 10/minute  |
| `POST` | `/v1/auth/password-reset/confirm` | Public  | 10/minute  |

Successful auth responses return the user and a short-lived CSRF token in `data`. Session tokens are delivered only through `Set-Cookie`.

## Owned tables and migrations

The module owns `auth_sessions` and `auth_password_reset_tokens`. Plaintext tokens are never stored; both tables store SHA-256 token hashes.

Run `pnpm db:generate:auth` to review schema changes and `pnpm db:migrate` to apply migrations in dependency order. Use `pnpm auth:cleanup` to remove expired sessions and used or expired reset tokens.

See [`../../docs/auth.md`](../../docs/auth.md) for routes, security decisions, cleanup, and testing notes.
