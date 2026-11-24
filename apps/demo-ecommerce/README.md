# E-commerce demonstration (M9a)

This app is the complete M9a demonstration: a browser storefront, a separate API process, and a PostgreSQL database. It uses the M8 shared modules for identity, catalog, products, inventory, and orders. The cart is intentionally **demo-local** and lives only under this app.

> Checkout stops at order confirmation. It never captures payment, reserves a payment method, sends a receipt, or transitions an order to a paid state.

## What is enabled

| Capability    | Implementation                                      |
| ------------- | --------------------------------------------------- |
| Auth/users    | `@skeletonstructure/module-auth`, `module-users`    |
| Catalog       | `@skeletonstructure/module-catalog`                 |
| Products      | `@skeletonstructure/module-products`                |
| Inventory     | `@skeletonstructure/module-inventory`               |
| Orders        | `@skeletonstructure/module-orders`                  |
| Cart          | `apps/demo-ecommerce/modules/cart` (app-local only) |
| Storefront    | Vite + vanilla TypeScript                           |
| Shared client | `@skeletonstructure/sdk`                            |
| Cart client   | `src/web/demo-client.ts` (typed, app-local)         |

No shared core or module contract was changed to support this app. `createM8Composition({ additionalModules, moduleConfig })` is reused from `@skeletonstructure/app-composition`; the app merges the cart's route handlers app-locally. There is no `packages/module-cart`.

## Requirements

- Node.js 22 or newer
- pnpm 10
- PostgreSQL 16
- Docker, for the development database below and for Testcontainers-backed tests

Start a local development database from the repository root if one is not already available:

```bash
docker run --name skeleton-pg \
  -e POSTGRES_USER=skeleton \
  -e POSTGRES_PASSWORD=skeleton \
  -e POSTGRES_DB=skeleton \
  -p 5432:5432 -d postgres:16-alpine
```

These credentials are development-only. Use a least-privilege role and different credentials for any deployed instance.

## Configuration

From this app directory, copy `.env.example` to `.env`. The default `DATABASE_URL` matches the container above; override it if your database differs. The public checkout flow also needs a seeded demo user. The seed credentials are local-only and must never be placed in browser code.

```bash
cd apps/demo-ecommerce
cp .env.example .env
```

`DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` are read by the seed script only. They are not imported by `src/web/`.

## Start from a fresh database

From the repository root:

```bash
pnpm demo:ecommerce:migrate
pnpm demo:ecommerce:seed
```

Expected seed data:

- User: `demo@skeletonstructure.local` / `demo-password-123` unless overridden
- Permissions added to the `user` role: `catalog:read`, `orders:create`, `orders:read`, `cart:read`, `cart:write`, `cart:checkout`
- Products: `demo-coffee`, `demo-mug`, `demo-notebook`

Seeding is idempotent: repeated runs keep the same user and products, and do not duplicate rows.

Run the API and storefront in separate terminals:

```bash
pnpm demo:ecommerce:api
pnpm demo:ecommerce:dev
```

Open <http://localhost:5173>, log in with the seeded credentials, add an item, manage the cart, check out, and view order history. The API listens on port 3000 by default and the Vite server proxies `/v1` to it.

## Cart behavior

The cart tables are `demo_ecommerce_carts` and `demo_ecommerce_cart_items`. They store only the buyer reference, catalog item id, quantity, and timestamps. Prices and product names are resolved on the server through the public `catalog` and `products` APIs at cart-read and checkout time; no client-supplied price is trusted.

Routes:

| Method   | Route                    | Permission      | Purpose                       |
| -------- | ------------------------ | --------------- | ----------------------------- |
| `GET`    | `/v1/cart`               | `cart:read`     | Read the current buyer cart   |
| `PUT`    | `/v1/cart/items/:itemId` | `cart:write`    | Set an item quantity (1–99)   |
| `DELETE` | `/v1/cart/items/:itemId` | `cart:write`    | Remove an item                |
| `POST`   | `/v1/cart/checkout`      | `cart:checkout` | Create an order from the cart |

The buyer is derived only from the authenticated session via the shared buyer-context port. There is no buyer id in a cart route path or body. All cart routes require authentication and the declared permission; unsafe methods also require a valid cookie CSRF token. Carts are isolated per user id.

Checkout result is explicit:

```ts
{ order: Order, cartCleared: boolean }
```

- If `orders.create()` fails (for example, insufficient inventory), the HTTP request fails and the cart is unchanged.
- If order creation succeeds, the cart is cleared in a transaction and `cartCleared` is `true`.
- If order persistence succeeds but cart cleanup fails, the API still returns the confirmed order with `cartCleared: false`. The browser keeps the same idempotency key and offers **Retry checkout**; the shared orders module returns the original order and cleanup is retried.
- If the response is lost after a successful cleanup, retrying the same key on the empty cart returns the original stored order.

Reserved inventory remains reserved after confirmation, matching M8's limitation. Cancellation, refunds, and stock release are not implemented in M9a.

## Payment seam

M9a deliberately stops at the confirmed order. The seam for a later milestone is:

1. Checkout creates an order through `orders.create()` with a stable idempotency key.
2. The response exposes the order id and `confirmed` status only.
3. A future payment module would consume `order.id`, `order.totalAmount`, and `order.currency`, then record a payment result keyed by the same idempotency key.
4. Until that module exists, no browser or server code sends an amount to a processor and no order status other than `confirmed` is produced.

See [`../../docs/m9.md`](../../docs/m9.md) for the milestone-level statement.

## Generated artifacts

Shared routes still use the committed root contract and the public SDK. Demo-local cart routes have a separate generated OpenAPI document and typed client:

- `openapi/demo-openapi.json` — generated from the real Fastify routes by `pnpm demo:ecommerce:openapi:generate`
- `src/web/demo-client.generated.ts` — generated from that document by `pnpm demo:ecommerce:client:generate`

Drift checks are deterministic:

```bash
pnpm demo:ecommerce:openapi:check
pnpm demo:ecommerce:client:check
```

The browser uses `@skeletonstructure/sdk` for all shared routes, including the product expansion whose types come from `expand=product`. It uses the app-local typed client only for `/cart` routes. The SDK instance keeps its own CSRF token internally; the demo client is given the CSRF token returned by login or `auth/me`.

## Verification

From the repository root:

```bash
pnpm demo:ecommerce:verify
```

That runs the demo OpenAPI/client drift checks, PostgreSQL integration tests (fresh migration, repeated migration/seed, authz, ownership, checkout failure/success, and idempotent replay), and the Playwright browser happy path against a real API and a Testcontainers database.

For Playwright only, install Chromium once before the first run:

```bash
pnpm --filter @skeletonstructure/demo-ecommerce exec playwright install chromium
```
