import { createHash } from 'node:crypto';

import { HttpError, validationError } from '@skeletonstructure/core/api';
import type { Database, DatabaseTransaction } from '@skeletonstructure/core/database';
import {
  decodeCursor,
  encodeCursor,
  type InventoryPort,
  type ItemSnapshot,
  newPrefixedId,
  type PriceResolverPort,
} from '@skeletonstructure/module-catalog';
import { and, desc, eq, lt, or } from 'drizzle-orm';

import { orderIdempotency, orderItems, orders } from './schema.js';
import {
  BUYER_CONTEXT_PORT,
  type BuyerContextPort,
  type BuyerRef,
  type CreateOrderContext,
  type CreateOrderInput,
  type CreateOrderLineInput,
  type ListOrdersInput,
  type Order,
  type OrderLine,
} from './types.js';

export type { BuyerContextPort };
export { BUYER_CONTEXT_PORT };

type OrderExecutor = Database['db'] | DatabaseTransaction;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

interface Canonicalizable {
  readonly [key: string]: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const source = value as Canonicalizable;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) result[key] = canonicalize(source[key]);
    return result;
  }
  return value;
}

function hashRequest(input: CreateOrderInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)), 'utf8')
    .digest('hex');
}

function buyerReference(buyer: BuyerRef): string {
  return buyer.kind === 'user' ? buyer.id : buyer.tokenHash;
}

function validateBuyer(buyer: BuyerRef): void {
  if (buyer.kind !== 'user') {
    throw new HttpError({ status: 403, code: 'FORBIDDEN' });
  }
}

function validateIdempotencyKey(key: string | undefined, required: boolean): string | undefined {
  if (key === undefined) {
    if (required) {
      throw validationError([
        { path: 'headers.idempotency-key', message: 'Idempotency-Key header is required.' },
      ]);
    }
    return undefined;
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw validationError([
      {
        path: 'headers.idempotency-key',
        message: 'Idempotency-Key must be 1 to 200 safe characters.',
      },
    ]);
  }
  return key;
}

function validateInput(input: CreateOrderInput, hasResolver: boolean): void {
  const details: { path: string; message: string }[] = [];
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    details.push({ path: 'body.items', message: 'An order must contain 1 to 100 items.' });
    throw validationError(details);
  }

  input.items.forEach((line, index) => {
    const prefix = `body.items.${index}`;
    if (typeof line.itemId !== 'string' || line.itemId.length === 0 || line.itemId.length > 200) {
      details.push({ path: `${prefix}.itemId`, message: 'Item ID is required.' });
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      details.push({ path: `${prefix}.quantity`, message: 'Quantity must be a positive integer.' });
    }
    if (hasResolver) {
      if (line.unitAmount !== undefined || line.currency !== undefined) {
        details.push({
          path: prefix,
          message: 'Client prices are rejected when a price resolver is enabled.',
        });
      }
    } else {
      if (!Number.isInteger(line.unitAmount) || (line.unitAmount ?? -1) < 0) {
        details.push({
          path: `${prefix}.unitAmount`,
          message: 'Unit amount is required when no price resolver is enabled.',
        });
      }
      if (typeof line.currency !== 'string' || !CURRENCY_PATTERN.test(line.currency)) {
        details.push({
          path: `${prefix}.currency`,
          message: 'Currency is required when no price resolver is enabled.',
        });
      }
    }
  });

  if (details.length > 0) throw validationError(details);
}

function toDetails(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toOrder(
  row: typeof orders.$inferSelect,
  lineRows: readonly (typeof orderItems.$inferSelect)[],
): Order {
  const items: readonly OrderLine[] = lineRows.map((line) => ({
    itemId: line.catalogItemId,
    name: line.nameSnapshot,
    quantity: line.quantity,
    unitAmount: line.unitAmountSnapshot,
    currency: line.currencySnapshot,
    extensionKind: line.extensionKind,
    detailsSchemaVersion: line.detailsSchemaVersion,
    details: toDetails(line.detailsSnapshot),
  }));
  return {
    id: row.id,
    status: row.status as Order['status'],
    buyer: { kind: 'user', id: row.buyerRef },
    items,
    totalAmount: row.totalAmount,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadOrder(executor: OrderExecutor, id: string): Promise<Order> {
  const [row] = await executor.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (row === undefined) {
    throw new HttpError({ status: 404, code: 'NOT_FOUND', message: 'Order not found.' });
  }
  const lineRows = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(orderItems.position);
  return toOrder(row, lineRows);
}

export interface CreateOrdersServiceOptions {
  readonly database: Database;
  readonly buyerContext: BuyerContextPort;
  readonly priceResolver?: PriceResolverPort;
  readonly inventory?: InventoryPort;
  readonly requireIdempotencyKey: boolean;
}

export interface OrdersService {
  create(input: CreateOrderInput, context: CreateOrderContext): Promise<Order>;
  getById(id: string, buyer: BuyerRef, canReadAny: boolean): Promise<Order>;
  list(
    input: ListOrdersInput,
  ): Promise<{ readonly orders: readonly Order[]; readonly nextCursor?: string }>;
}

export function createOrdersService(options: CreateOrdersServiceOptions): OrdersService {
  const { database } = options;
  const priceResolver = options.priceResolver;

  async function resolveSnapshots(input: CreateOrderInput): Promise<readonly ItemSnapshot[]> {
    const snapshots: ItemSnapshot[] = [];
    for (const line of input.items) {
      if (priceResolver !== undefined) {
        snapshots.push(await priceResolver.snapshot(line.itemId));
        continue;
      }
      const typed = line as CreateOrderLineInput;
      snapshots.push({
        itemId: line.itemId,
        name: line.itemId,
        unitAmount: typed.unitAmount ?? 0,
        currency: typed.currency ?? '',
        extensionKind: 'client',
        detailsSchemaVersion: 1,
        details: {},
      });
    }
    return snapshots;
  }

  function assertSingleCurrency(snapshots: readonly ItemSnapshot[]): string {
    const first = snapshots[0];
    if (first === undefined)
      throw validationError([{ path: 'body.items', message: 'Items are required.' }]);
    for (const snapshot of snapshots) {
      if (snapshot.currency !== first.currency) {
        throw validationError([
          { path: 'body.items', message: 'All order items must use the same currency.' },
        ]);
      }
    }
    return first.currency;
  }

  return {
    async create(input: CreateOrderInput, context: CreateOrderContext) {
      validateBuyer(context.buyer);
      const key = validateIdempotencyKey(context.idempotencyKey, options.requireIdempotencyKey);
      validateInput(input, priceResolver !== undefined);
      const requestHash = hashRequest(input);
      const buyerRef = buyerReference(context.buyer);

      return database.transaction(async (tx) => {
        if (key !== undefined) {
          const inserted = await tx
            .insert(orderIdempotency)
            .values({
              buyerRef,
              idempotencyKey: key,
              requestHash,
              orderId: null,
              status: 'pending',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoNothing()
            .returning({ idempotencyKey: orderIdempotency.idempotencyKey });
          if (inserted.length === 0) {
            const [existing] = await tx
              .select()
              .from(orderIdempotency)
              .where(
                and(
                  eq(orderIdempotency.buyerRef, buyerRef),
                  eq(orderIdempotency.idempotencyKey, key),
                ),
              )
              .limit(1);
            if (existing === undefined) {
              throw new HttpError({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
            }
            if (existing.requestHash !== requestHash) {
              throw new HttpError({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
            }
            if (existing.status !== 'completed' || existing.orderId === null) {
              throw new HttpError({
                status: 409,
                code: 'CONFLICT',
                message: 'The original order is still being created.',
              });
            }
            return loadOrder(tx, existing.orderId);
          }
        }

        const snapshots = await resolveSnapshots(input);
        const currency = assertSingleCurrency(snapshots);
        if (options.inventory !== undefined) {
          await options.inventory.tryReserve(
            input.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
            tx,
          );
        }

        const id = newPrefixedId('ord');
        const now = new Date();
        const totalAmount = snapshots.reduce(
          (total, snapshot, index) =>
            total + snapshot.unitAmount * (input.items[index]?.quantity ?? 0),
          0,
        );

        await tx.insert(orders).values({
          id,
          status: 'confirmed',
          buyerKind: context.buyer.kind,
          buyerRef,
          idempotencyKey: key ?? null,
          requestHash,
          totalAmount,
          currency,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(orderItems).values(
          snapshots.map((snapshot, index) => ({
            id: newPrefixedId('ordi'),
            orderId: id,
            catalogItemId: snapshot.itemId,
            position: index,
            quantity: input.items[index]?.quantity ?? 0,
            nameSnapshot: snapshot.name,
            unitAmountSnapshot: snapshot.unitAmount,
            currencySnapshot: snapshot.currency,
            extensionKind: snapshot.extensionKind,
            detailsSchemaVersion: snapshot.detailsSchemaVersion,
            detailsSnapshot: snapshot.details,
            createdAt: now,
          })),
        );

        if (key !== undefined) {
          await tx
            .update(orderIdempotency)
            .set({ orderId: id, status: 'completed', updatedAt: now })
            .where(
              and(
                eq(orderIdempotency.buyerRef, buyerRef),
                eq(orderIdempotency.idempotencyKey, key),
              ),
            );
        }

        return loadOrder(tx, id);
      });
    },

    async getById(id: string, buyer: BuyerRef, canReadAny: boolean) {
      validateBuyer(buyer);
      const order = await loadOrder(database.db, id);
      const ownershipRef = {
        buyerKind: order.buyer.kind,
        buyerRef: order.buyer.kind === 'user' ? order.buyer.id : order.buyer.tokenHash,
      };
      if (!canReadAny && !options.buyerContext.owns(ownershipRef, buyer)) {
        throw new HttpError({ status: 403, code: 'FORBIDDEN' });
      }
      return order;
    },

    async list(input: ListOrdersInput) {
      validateBuyer(input.buyer);
      const position = decodeCursor(input.cursor);
      const buyerRef = buyerReference(input.buyer);
      const conditions = [
        eq(orders.buyerRef, buyerRef),
        position === undefined
          ? undefined
          : or(
              lt(orders.createdAt, new Date(position.createdAt)),
              and(eq(orders.createdAt, new Date(position.createdAt)), lt(orders.id, position.id)),
            ),
      ].filter((condition) => condition !== undefined);

      const rows = await database.db
        .select()
        .from(orders)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const loaded = await Promise.all(page.map((row) => loadOrder(database.db, row.id)));
      const last = page.at(-1);
      return {
        orders: loaded,
        ...(hasMore && last !== undefined
          ? { nextCursor: encodeCursor(last.createdAt, last.id) }
          : {}),
      };
    },
  };
}
