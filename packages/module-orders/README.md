# `@skeletonstructure/module-orders`

Optional authenticated order package for M8. It consumes generic ports only and has no import dependency on `products`, `inventory`, `auth`, or `users`.

## Configuration and dependencies

```ts
modules: {
  auth: { enabled: true };
  users: { enabled: true };
  catalog: { enabled: true };
  orders: {
    enabled: true,
    requireIdempotencyKey: true,
  };
}
```

Requires `auth`, `users`, and `catalog`. Consumes `buyer-context@1` plus optional `price-resolver@1` and `inventory@1`.

## Permissions

- `orders:create`
- `orders:read`
- `orders:read:any` — allows reading another buyer's order

## Routes

- `POST /v1/orders` — requires `Idempotency-Key` when configured
- `GET /v1/orders/{id}` — owner only unless `orders:read:any`
- `GET /v1/orders` — owner-only history with `limit` and opaque `cursor`

## Behavior

Server-side prices replace client amounts when a resolver is active. Each line stores name, unit amount, currency, extension kind, details schema version, and details JSON at creation time. Duplicate idempotency keys with the same canonical payload return the original order; changed payloads return `409 IDEMPOTENCY_CONFLICT`. Buyer refs are resolved through `BuyerContextPort`, and `buyer_kind` is constrained to `user` in v0.1.

## Migrations

Run `pnpm db:generate:orders` to review schema changes and `pnpm db:migrate` to apply last. See [`docs/m8.md`](../../docs/m8.md).
