# ADR 0005 — Static M8 composition and early port ambiguity checks

- Date: 2026-11-23
- Status: accepted
- Milestone: M8

## Context

M8 introduces multiple catalog extensions and an order module that consumes optional capabilities. Core must not import application modules, and a module must not import a sibling extension in order to discover a provider. Contributor applications may also add their own static modules. Multiple active price resolvers would silently change order pricing unless startup fails deterministically.

## Decision

A non-domain `@skeletonstructure/app-composition` package owns the checked-in M8 wiring. It builds explicit module definitions, resolves consumed ports through the M4 registry, and filters route handlers to the activation report. `assertSinglePriceResolver()` runs before registry activation and before the Fastify server listens; it fails with `AMBIGUOUS_PRICE_RESOLVER` and names every conflicting provider plus the application name. `additionalModules` allows application-owned static providers to participate in the same check.

## Alternatives considered

1. Let the registry silently pick the first price provider: rejected because pricing authority would be configuration-order dependent and unsafe.
2. Add plugin discovery or a service locator: rejected because it violates explicit static composition and would make startup behavior dynamic.
3. Make `orders` import `products` directly: rejected because it couples the domain module to one extension and breaks reuse for restaurant or other catalogs.

## Consequences

- Startup is deterministic and ambiguity is visible before any port is open.
- Applications have one explicit place to review the dependency graph and composition order.
- The composition package is application wiring, not a core abstraction or a runtime plugin system.
- Adding a second provider requires either disabling one module or resolving the ambiguity in checked-in application code.

## Verification

Unit tests cover one-provider success, two-provider failure with the exact code/message content, and an application-owned second provider. Integration tests start the composed server with and without inventory. `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm openapi:check` verify the wiring and generated contract.
