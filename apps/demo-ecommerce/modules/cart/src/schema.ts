import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const demoEcommerceCarts = pgTable('demo_ecommerce_carts', {
  buyerRef: text('buyer_ref').primaryKey(),
  lastIdempotencyKey: text('last_idempotency_key'),
  lastOrderId: text('last_order_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const demoEcommerceCartItems = pgTable(
  'demo_ecommerce_cart_items',
  {
    buyerRef: text('buyer_ref')
      .notNull()
      .references(() => demoEcommerceCarts.buyerRef, { onDelete: 'cascade' }),
    // The FK is declared in the reviewed migration so Drizzle Kit does not
    // redeclare the shared catalog_items table owned by module-catalog.
    catalogItemId: text('catalog_item_id').notNull(),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buyerRef, table.catalogItemId] }),
    check('demo_ecommerce_cart_items_quantity_check', sql`${table.quantity} between 1 and 99`),
  ],
);
