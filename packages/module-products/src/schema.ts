import { catalogItems } from '@skeletonstructure/module-catalog';
import { sql } from 'drizzle-orm';
import { char, check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const commerceProducts = pgTable(
  'commerce_products',
  {
    catalogItemId: text('catalog_item_id')
      .primaryKey()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull().unique(),
    priceAmount: integer('price_amount').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    weightGrams: integer('weight_grams'),
    shippingClass: text('shipping_class'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('commerce_products_price_amount_check', sql`${table.priceAmount} >= 0`)],
);
