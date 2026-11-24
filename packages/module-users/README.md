# `@skeletonstructure/module-users`

Optional M6 module for user identity, profiles, roles, and permission grants. It has no required module dependencies and is required by `auth`.

## Configuration

```ts
modules: {
  users: {
    enabled: true,
    allowSelfUpdate: true;
  };
}
```

`allowSelfUpdate` defaults to `true`. When it is `false`, the `PATCH /v1/users/me` route is not registered; the read route and permission remain available.

## Permissions

- `users:read:self` — read the current user profile.
- `users:update:self` — update the current user profile.

The default `user` role starts with both permissions. Role and permission assignment data must be managed by the application; there is no self-service role grant route.

## Routes

| Method  | Path           | Permission          | Availability                                     |
| ------- | -------------- | ------------------- | ------------------------------------------------ |
| `GET`   | `/v1/users/me` | `users:read:self`   | Always registered when enabled                   |
| `PATCH` | `/v1/users/me` | `users:update:self` | Registered only when `allowSelfUpdate` is `true` |

Both routes enforce ownership from the authenticated principal in the use case. A role permission never bypasses the ownership check.

## Owned tables and migrations

The module owns `users_users`, `users_user_roles`, and `users_role_permissions`. Password hashes are never exposed through its public API.

Run `pnpm db:generate:users` to review schema changes and `pnpm db:migrate` to apply migrations in dependency order. See [`../../docs/auth.md`](../../docs/auth.md) for the full authorization model.
