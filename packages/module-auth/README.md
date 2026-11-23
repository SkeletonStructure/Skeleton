# @skeletonstructure/module-auth

Optional M6 module for authentication and session management. Requires `users`.

- Owns `auth_sessions` and `auth_password_reset_tokens`.
- Implements register, login, logout, `/auth/me`, and password reset routes.
- Uses opaque SHA-256-hashed sessions in httpOnly cookies and accepts the same token as a bearer credential.
- Supplies the M5 `Authenticator` and an injected CSRF guard.
- Consumes an `EmailProvider`; the console adapter logs only recipient, template, and status.

See [`../../docs/auth.md`](../../docs/auth.md) for routes, security decisions, and cleanup.
