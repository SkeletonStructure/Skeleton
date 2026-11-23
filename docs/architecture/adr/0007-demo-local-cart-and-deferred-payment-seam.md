# ADR 0007 — Demo-local cart and deferred payment seam

- Date: 2026-11-23
- Status: accepted
- Milestone: M9a

## Context

The M9a demonstration needs a familiar browse → cart → checkout → order-history flow. A cart is useful for proving server-authoritative pricing and order idempotency, but it is not part of the M1–M8 shared domain. Adding it to `packages/` would grow the public module surface and imply a supported contract that the milestone does not need.

The demonstration also needs to show where payment would fit without pretending that payment is implemented.

## Decision

The cart lives only in `apps/demo-ecommerce/modules/cart`. It uses the shared catalog, products, orders, and buyer-context APIs through their public types. It owns two private tables (`demo_ecommerce_carts`, `demo_ecommerce_cart_items`) and four private routes (`GET/PUT/DELETE/POST` under `/v1/cart`). No `packages/module-cart` is created and no shared core/module contract changes.

The app composes M8 with `additionalModules` and app-owned configuration, then merges cart route handlers locally. Cart buyers come only from the authenticated session. Prices are resolved server-side at read and checkout time; the cart stores no amounts.

Checkout returns `{ order, cartCleared }`. The cart is cleared only after order persistence succeeds. Cleanup failure after persistence is reported explicitly rather than being hidden as a failed checkout; retrying with the same idempotency key returns the original order and retries cleanup.

Payments are deferred. The confirmed order is the seam: a future payment capability can key a payment attempt to the order id and idempotency key. M9a sends no amounts to any processor and introduces no payment status.

Demo-local routes get a separate OpenAPI artifact and generated typed client. Shared routes continue to use the root OpenAPI artifact and public SDK.

## Alternatives considered

1. Add a reusable `module-cart` package: rejected because M9a needs a demonstration, not a new supported domain contract.
2. Put cart fields on the user or product tables: rejected because it couples unrelated module schemas to a demo concern.
3. Store prices in cart rows: rejected because it would duplicate authoritative product pricing and allow stale amounts.
4. Treat cleanup failure as checkout failure: rejected because the order is already committed and the client cannot safely infer what happened.
5. Capture a fake payment: rejected because the milestone must not imply payment support.

## Consequences

- The demo can be read as an example of extending the platform without modifying it.
- Buyer isolation is enforced by deriving the cart owner from the session, not the request body.
- The frontend needs a small app-local client for cart routes in addition to the public SDK.
- Order confirmation is terminal in M9a; payment, refunds, cancellation, and inventory release remain later work.
- Separate demo OpenAPI/client artifacts require explicit drift checks.

## Verification

PostgreSQL integration tests cover fresh and repeated migrations, idempotent seed, auth/CSRF on every cart route, buyer isolation, failed checkout leaving the cart intact, successful clearing, and idempotent replay. A Playwright test drives the complete browser flow against a real API and Testcontainers database. OpenAPI and client drift checks validate the committed demo artifacts.
