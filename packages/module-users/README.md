# @skeletonstructure/module-users

Optional M6 module for user identity, profiles, roles, and permission grants.

- Owns `users_users`, `users_user_roles`, and `users_role_permissions`.
- Registers `users:read:self` and `users:update:self`.
- Exposes `GET /v1/users/me` and, when enabled, `PATCH /v1/users/me`.
- Enforces ownership checks separately from permission checks.
- Never exposes password hashes through its public API.

See [`../../docs/auth.md`](../../docs/auth.md) for the full authorization model.
