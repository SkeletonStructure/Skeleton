import type { DatabaseTransaction } from '@skeletonstructure/core/database';

import type { CatalogItemId } from './types.js';

export const PRICE_RESOLVER_PORT = { id: 'price-resolver', version: 1 } as const;
export const INVENTORY_PORT = { id: 'inventory', version: 1 } as const;

export interface Money {
  readonly amount: number;
  readonly currency: string;
}

export interface PriceContext {
  readonly buyerKind?: 'user';
}

export interface ItemSnapshot {
  readonly itemId: CatalogItemId;
  readonly name: string;
  readonly unitAmount: number;
  readonly currency: string;
  readonly extensionKind: string;
  readonly detailsSchemaVersion: number;
  readonly details: Record<string, unknown>;
}

/** Provided by catalog extensions such as `products`. */
export interface PriceResolverPort {
  resolve(itemId: CatalogItemId, context: PriceContext): Promise<Money>;
  snapshot(itemId: CatalogItemId): Promise<ItemSnapshot>;
}

export interface StockReservationItem {
  readonly itemId: CatalogItemId;
  readonly quantity: number;
}

/** Provided by `inventory`; keyed by catalog item ID, never by extension ID. */
export interface InventoryPort {
  tryReserve(items: readonly StockReservationItem[], executor?: DatabaseTransaction): Promise<void>;
  release(items: readonly StockReservationItem[], executor?: DatabaseTransaction): Promise<void>;
}
