import { HttpError, validationError } from '@skeletonstructure/core/api';
import type { Database, DatabaseTransaction } from '@skeletonstructure/core/database';
import {
  type CatalogApi,
  type CatalogItemId,
  INVENTORY_PORT,
  type InventoryPort,
  type StockReservationItem,
} from '@skeletonstructure/module-catalog';
import { and, eq, gte, sql } from 'drizzle-orm';

import { inventoryItems } from './schema.js';
import type { InventoryApi, InventoryItem } from './types.js';

export type { InventoryPort };
export { INVENTORY_PORT };

type InventoryExecutor = Database['db'] | DatabaseTransaction;

function toInventoryItem(row: typeof inventoryItems.$inferSelect): InventoryItem {
  return {
    itemId: row.catalogItemId,
    quantity: row.quantity,
    reserved: row.reserved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function aggregate(items: readonly StockReservationItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw validationError([
        { path: 'body.items.quantity', message: 'Quantity must be a positive integer.' },
      ]);
    }
    totals.set(item.itemId, (totals.get(item.itemId) ?? 0) + item.quantity);
  }
  return totals;
}

export interface CreateInventoryServiceOptions {
  readonly database: Database;
  readonly catalog: CatalogApi;
  readonly allowNegativeStock: boolean;
}

export function createInventoryService(
  options: CreateInventoryServiceOptions,
): InventoryApi & InventoryPort {
  const db = options.database.db;

  async function get(itemId: CatalogItemId): Promise<InventoryItem> {
    const [row] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.catalogItemId, itemId))
      .limit(1);
    if (row === undefined) {
      throw new HttpError({ status: 404, code: 'NOT_FOUND', message: 'Inventory item not found.' });
    }
    return toInventoryItem(row);
  }

  const api: InventoryApi & InventoryPort = {
    get,

    async set(itemId: CatalogItemId, quantity: number) {
      await options.catalog.getById(itemId);
      if (!Number.isInteger(quantity) || (quantity < 0 && !options.allowNegativeStock)) {
        throw validationError([
          { path: 'body.quantity', message: 'Quantity must be a non-negative integer.' },
        ]);
      }
      const now = new Date();
      const values = {
        catalogItemId: itemId,
        quantity,
        reserved: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db
        .insert(inventoryItems)
        .values(values)
        .onConflictDoUpdate({
          target: inventoryItems.catalogItemId,
          set: { quantity, updatedAt: now },
        });
      return toInventoryItem({ ...values, reserved: 0 });
    },

    async tryReserve(items, executor) {
      const tx: InventoryExecutor = executor ?? db;
      const totals = aggregate(items);
      for (const [itemId, quantity] of totals) {
        const now = new Date();
        const conditions =
          options.allowNegativeStock === false
            ? and(eq(inventoryItems.catalogItemId, itemId), gte(inventoryItems.quantity, quantity))
            : eq(inventoryItems.catalogItemId, itemId);
        const rows = await tx
          .update(inventoryItems)
          .set({
            quantity: sql`${inventoryItems.quantity} - ${quantity}`,
            reserved: sql`${inventoryItems.reserved} + ${quantity}`,
            updatedAt: now,
          })
          .where(conditions)
          .returning({ catalogItemId: inventoryItems.catalogItemId });
        if (rows.length === 0) {
          throw new HttpError({
            status: 409,
            code: 'CONFLICT',
            message: 'Insufficient stock for one or more catalog items.',
          });
        }
      }
    },

    async release(items, executor) {
      const tx: InventoryExecutor = executor ?? db;
      const totals = aggregate(items);
      for (const [itemId, quantity] of totals) {
        const now = new Date();
        const rows = await tx
          .update(inventoryItems)
          .set({
            quantity: sql`${inventoryItems.quantity} + ${quantity}`,
            reserved: sql`${inventoryItems.reserved} - ${quantity}`,
            updatedAt: now,
          })
          .where(
            and(eq(inventoryItems.catalogItemId, itemId), gte(inventoryItems.reserved, quantity)),
          )
          .returning({ catalogItemId: inventoryItems.catalogItemId });
        if (rows.length === 0) {
          throw new HttpError({
            status: 409,
            code: 'CONFLICT',
            message: 'Cannot release more stock than is reserved.',
          });
        }
      }
    },
  };

  return api;
}
