import type { CatalogItemId } from '@skeletonstructure/module-catalog';

export interface InventoryConfig {
  readonly allowNegativeStock: boolean;
}

export interface InventoryItem {
  readonly itemId: CatalogItemId;
  readonly quantity: number;
  readonly reserved: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InventoryApi {
  get(itemId: CatalogItemId): Promise<InventoryItem>;
  set(itemId: CatalogItemId, quantity: number): Promise<InventoryItem>;
}
