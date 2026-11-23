import { catalogItems } from '@skeletonstructure/module-catalog';
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const inventoryItems = pgTable(
  'inventory_items',
  {
    catalogItemId: text('catalog_item_id')
      .primaryKey()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    reserved: integer('reserved').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('inventory_items_reserved_check', sql`${table.reserved} >= 0`)],
);
