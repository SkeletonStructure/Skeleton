# `@skeletonstructure/module-products`

Optional e-commerce catalog extension for M8. It stores product details in `commerce_products`, keyed by an existing `catalogItemId`, and provides the server-side `PriceResolverPort`.

## Configuration and dependencies

```ts
modules: {
  catalog: { enabled: true };
  products: {
    enabled: true,
    defaultCurrency: 'USD',
  };
}
```

Requires `catalog`. Declares `provides: [price-resolver@1]`; no `enhances` edge is used.

## Permission

- `products:write`

## Routes

- `GET /v1/catalog/items/{id}/product` — uses `catalog:read` unless `catalog.publicRead` is enabled
- `PATCH /v1/catalog/items/{id}/product` — upsert; fails with `404 NOT_FOUND` unless the catalog item exists

The same details are available through `GET /v1/catalog/items?expand=product` and `GET /v1/catalog/items/{id}?expand=product`.

## Snapshots

`PriceResolverPort.resolve()` returns the server price. `snapshot()` returns immutable line data with `extensionKind = 'product'` and `detailsSchemaVersion = 1`. Orders snapshot these values at creation; later catalog or product edits do not rewrite existing orders.

## Migrations

Run `pnpm db:generate:products` to review schema changes and `pnpm db:migrate` to apply after the catalog migration. See [`docs/m8.md`](../../docs/m8.md).
