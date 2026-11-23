# `@skeletonstructure/module-catalog`

Optional generic catalog package for M8. It owns `catalog_items` and the base catalog HTTP surface; domain extensions such as `products` live in separate packages.

## Configuration

```ts
modules: {
  catalog: {
    enabled: true,
    publicRead: false,
  };
}
```

`publicRead: true` allows anonymous `GET` routes. Otherwise `catalog:read` is required.

## Permissions

- `catalog:read`
- `catalog:write`

## Routes

- `GET /v1/catalog/items`
- `GET /v1/catalog/items/{id}`
- `POST /v1/catalog/items`
- `PATCH /v1/catalog/items/{id}`
- `DELETE /v1/catalog/items/{id}` — archives the item rather than deleting its row

List and detail routes accept `?expand=<kind>`; only expansion kinds supplied by registered providers are valid. Unknown kinds return `400 VALIDATION_ERROR`. List routes also accept `limit` and opaque `cursor`.

## Public API and contracts

`createCatalogService()` exposes create, read, list, update, and archive operations for other modules. This package also declares the generic `PriceResolverPort`, `InventoryPort`, `Money`, `PriceContext`, `ItemSnapshot`, and `StockReservationItem` contracts without importing concrete extensions.

## Migrations

Run `pnpm db:generate:catalog` to review schema changes and `pnpm db:migrate` to apply `catalog_items` in dependency order. See [`docs/m8.md`](../../docs/m8.md).
