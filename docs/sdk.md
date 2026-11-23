# Frontend SDK

M7 introduced `@skeletonstructure/sdk`, a small browser-safe HTTP client for the public API. M8 extends it with catalog, products, inventory, and orders namespaces. Types are generated from the committed `openapi/openapi.json` contract plus a hand-written `fetch` wrapper. It has no server dependencies and never reads server configuration or environment variables.

## Installation and generation

The SDK is a workspace package. Regenerate its types after changing public routes or response schemas:

```bash
pnpm sdk:generate
pnpm sdk:check
pnpm test:contract
```

`pnpm sdk:generate` writes `packages/sdk/generated/api.ts` from the committed OpenAPI artifact. `pnpm sdk:check` fails if that file is stale. Both commands are deterministic and need no database.

## Initialization

```ts
import { createSkeletonClient } from '@skeletonstructure/sdk';

const Skeleton = createSkeletonClient({
  baseUrl: '/v1',
  credentials: 'include',
});
```

| Option            | Type                                                        | Default        | Purpose                                                |
| ----------------- | ----------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| `baseUrl`         | `string`                                                    | `/v1`          | API base URL. Same-origin is recommended for browsers. |
| `credentials`     | `'include' \| 'omit'`                                       | `'include'`    | Cookie session behavior.                               |
| `bearerToken`     | `() => string \| undefined \| Promise<string \| undefined>` | none           | Supplies an opaque token for native/service clients.   |
| `csrfTokenHeader` | `string`                                                    | `x-csrf-token` | Header used for cookie CSRF protection.                |
| `fetch`           | `typeof fetch`                                              | global `fetch` | Injectable transport for tests and custom runtimes.    |
| `onError`         | `(error: SkeletonError) => void`                            | none           | Receives sanitized typed errors only.                  |

The client never stores bearer tokens or CSRF tokens in browser storage. CSRF tokens live only in client memory for the lifetime of the client instance. If an `onError` hook throws, the SDK ignores that failure and still rejects with the sanitized error.

## Namespaces

```ts
await Skeleton.config.getPublic();

await Skeleton.auth.register({ email, password });
await Skeleton.auth.login({ email, password });
await Skeleton.auth.getCurrentUser();
await Skeleton.auth.requestPasswordReset({ email });
await Skeleton.auth.confirmPasswordReset({ token, password });
await Skeleton.auth.logout();

await Skeleton.users.getMe();
await Skeleton.users.updateMe({ displayName });

const products = await Skeleton.products.getAll({ limit: 5 });
products.data.items[0]?.details.product.sku;

await Skeleton.inventory.set(itemId, { quantity: 10 });

const order = await Skeleton.orders.create(
  { items: [{ itemId, quantity: 1 }] },
  { idempotencyKey: 'checkout-1' },
);
await Skeleton.orders.getById(order.data.id);
await Skeleton.orders.list({ limit: 20 });
```

`catalog.getAll()` and `catalog.getById()` accept `limit`, `cursor`, `status`, and `expand` options. `products.getAll()` and `products.getById()` always request `expand=product` and narrow `details.product` types. `orders.create()` sends `CreateOrderOptions.idempotencyKey` as the `Idempotency-Key` header.

Every method returns the API success envelope generated from the OpenAPI artifact:

```ts
const response = await Skeleton.auth.getCurrentUser();
response.data.user.email;
response.meta.requestId;
```

## Authentication and CSRF

Browser clients use the httpOnly session cookie; the SDK cannot read it and never requests a plaintext session token. Registration, login, and password-reset confirmation return a short-lived CSRF token in `data.csrfToken`, which the client keeps in memory. Unsafe requests (`POST`, `PUT`, `PATCH`, `DELETE`) send that token in `x-csrf-token` when cookie credentials are used.

`auth.getCurrentUser()` rotates the CSRF token on the server. The SDK updates its cached token from every successful auth response, so later mutations use the current token.

When `bearerToken` supplies a credential, the SDK sets `Authorization: Bearer …` and does not send the cookie CSRF header. The server maps bearer tokens to the same session store and skips the cookie CSRF check.

The SDK does not retry failed authentication or rate-limited requests.

## Typed errors

All public error codes map to typed errors:

| Code                   | Class                 |
| ---------------------- | --------------------- |
| `VALIDATION_ERROR`     | `ValidationError`     |
| `UNAUTHENTICATED`      | `AuthenticationError` |
| `FORBIDDEN`            | `AuthorizationError`  |
| `NOT_FOUND`            | `NotFoundError`       |
| `CONFLICT`             | `ConflictError`       |
| `IDEMPOTENCY_CONFLICT` | `IdempotencyError`    |
| `RATE_LIMITED`         | `RateLimitError`      |
| `INTERNAL`             | `InternalError`       |

Every error extends `SkeletonError` and exposes only `code`, `status`, `requestId`, `message`, and optional sanitized validation `details`. Error handling uses safe fixed messages, so raw response bodies, stack traces, SQL, tokens, and configuration never reach `onError` or application logs through the SDK. Malformed responses and network failures become safe `InternalError` values.

```ts
import { SkeletonError } from '@skeletonstructure/sdk';

try {
  await Skeleton.users.getMe();
} catch (error) {
  if (error instanceof SkeletonError) {
    console.warn(error.code, error.requestId);
  }
}
```

## Examples

- `examples/frontend-vanilla` — DOM API example using `textContent`.
- `examples/frontend-react` — small React component using the same client.

Both examples compile in CI and use only the SDK for backend communication.

## Current limitation

The SDK covers committed M8 routes only. It does not implement payment capture, guest checkout, admin operations, or demo-local cart/menu routes. Order pricing remains server-authoritative: the SDK exposes optional amount fields from the generated body type for protocol compatibility, but the server rejects them when a price resolver is enabled.
