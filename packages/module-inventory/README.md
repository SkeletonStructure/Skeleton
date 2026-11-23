# `@skeletonstructure/module-inventory`

Optional stock tracking extension for M8. Stock is keyed by `catalogItemId`, never by a product or order id.

## Configuration and dependencies

```ts
modules: {
  catalog: { enabled: true };
  inventory: {
    enabled: true,
    allowNegativeStock: false,
  };
}
```

Requires `catalog`. Provides `inventory@1` (`tryReserve` and `release`) for consumers such as `orders`.

## Permissions

- `inventory:read`
- `inventory:write`

## Routes

- `GET /v1/inventory/items/{itemId}`
- `PATCH /v1/inventory/items/{itemId}` — set available quantity

## Behavior

`tryReserve()` runs inside the caller's database transaction, checks available stock, and records reservations atomically. With `allowNegativeStock: false`, oversell is rejected. When this module is disabled, `orders` skips stock checks entirely. Automatic release is tied to cancellation flows, which are outside M8.

## Migrations

Run `pnpm db:generate:inventory` to review schema changes and `pnpm db:migrate` to apply after the catalog migration. See [`docs/m8.md`](../../docs/m8.md).
