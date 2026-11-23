import { catalogItems } from '@skeletonstructure/module-catalog';
import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const orders = pgTable(
  'orders_orders',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull().default('confirmed'),
    buyerKind: text('buyer_kind').notNull(),
    buyerRef: text('buyer_ref').notNull(),
    idempotencyKey: text('idempotency_key'),
    requestHash: text('request_hash'),
    totalAmount: integer('total_amount').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('orders_orders_buyer_kind_check', sql`${table.buyerKind} = 'user'`),
    check('orders_orders_status_check', sql`${table.status} = 'confirmed'`),
    uniqueIndex('orders_orders_buyer_idempotency_key_unique').on(
      table.buyerRef,
      table.idempotencyKey,
    ),
    index('orders_orders_buyer_created_at_idx').on(table.buyerRef, table.createdAt, table.id),
  ],
);

export const orderItems = pgTable(
  'orders_order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    quantity: integer('quantity').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    unitAmountSnapshot: integer('unit_amount_snapshot').notNull(),
    currencySnapshot: char('currency_snapshot', { length: 3 }).notNull(),
    extensionKind: text('extension_kind').notNull(),
    detailsSchemaVersion: integer('details_schema_version').notNull(),
    detailsSnapshot: jsonb('details_snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('orders_order_items_quantity_check', sql`${table.quantity} > 0`),
    check('orders_order_items_unit_amount_check', sql`${table.unitAmountSnapshot} >= 0`),
    check(
      'orders_order_items_details_schema_version_check',
      sql`${table.detailsSchemaVersion} > 0`,
    ),
    uniqueIndex('orders_order_items_order_position_unique').on(table.orderId, table.position),
    index('orders_order_items_order_id_idx').on(table.orderId),
  ],
);

export const orderIdempotency = pgTable(
  'orders_idempotency',
  {
    buyerRef: text('buyer_ref').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    orderId: text('order_id'),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'orders_idempotency_pk', columns: [table.buyerRef, table.idempotencyKey] }),
    check('orders_idempotency_status_check', sql`${table.status} in ('pending', 'completed')`),
  ],
);
