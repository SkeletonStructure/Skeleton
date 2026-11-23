# ADR 0006 — Generic catalog extensions and immutable order snapshots

- Date: 2026-11-23
- Status: accepted
- Milestone: M8

## Context

The catalog must support different domain extensions (commerce products now, restaurant menu items later) without core knowing their fields. Orders must remain stable after catalog or extension edits, and cursor pagination must be available without adding domain-specific pagination types to core.

## Decision

The catalog owns only base fields and accepts generic expansion loaders keyed by a `kind`. `PriceResolverPort`, `InventoryPort`, and `ItemSnapshot` live in `catalog` as contracts; concrete implementations live in extension packages and reference `catalogItemId`. Order lines write immutable snapshots of name, unit amount, currency, extension kind, details schema version, and details JSON. Client amounts are rejected whenever a resolver is active. Core adds only `CursorPage<T>`, `pageResult()`, and `isCursorPage()` with optional `meta.nextCursor`.

## Alternatives considered

1. Put extension columns on `catalog_items`: rejected because it would couple the generic catalog to one domain and allow nullable domain fields to proliferate.
2. Store only catalog item references in orders: rejected because later edits would rewrite historical orders.
3. Add extension-specific pagination or status types to core: rejected because it violates the dependency direction and duplicates module concerns.

## Consequences

- Products and future menu extensions remain distinct tables over one catalog core.
- Orders are reproducible and auditable from their stored snapshots.
- Extensions must declare an explicit schema version and snapshot formatter.
- Reservation state is persisted with an order, so cancellation/release lifecycle work remains a later concern.

## Verification

Unit tests check contract declarations and expansion validation. PostgreSQL integration tests check existing-catalog-item enforcement, server-price authority, snapshot immutability after edits, idempotency under concurrency, ownership, inventory skip, and oversell rejection. Contract tests check generated OpenAPI/SDK coverage and the absence of forbidden cross-module imports.
