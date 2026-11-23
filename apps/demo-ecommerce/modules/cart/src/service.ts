import { HttpError, validationError } from '@skeletonstructure/core/api';
import type { Database } from '@skeletonstructure/core/database';
import type { CatalogItem } from '@skeletonstructure/module-catalog';
import type { ProductDetails } from '@skeletonstructure/module-products';
import { and, eq } from 'drizzle-orm';

import { demoEcommerceCartItems, demoEcommerceCarts } from './schema.js';
import type { Cart, CartDependencies, CartLine, CartService } from './types.js';

export interface CreateCartServiceOptions {
  readonly database: Database;
  readonly maxQuantity: number;
}

export interface BoundCartService extends CartService {
  readonly bind: (dependencies: CartDependencies) => void;
}

function invalidQuantity(maxQuantity: number): HttpError {
  return validationError([
    {
      path: 'body.quantity',
      message: `Quantity must be an integer between 1 and ${maxQuantity}.`,
    },
  ]);
}

function isMissingProduct(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404;
}

/** Demo-local cart use cases. All shared capabilities arrive through public module APIs. */
export function createCartService(options: CreateCartServiceOptions): BoundCartService {
  const { database, maxQuantity } = options;
  let dependencies: CartDependencies | undefined;

  function requireDependencies(): CartDependencies {
    if (dependencies === undefined) {
      throw new Error('Cart dependencies were not bound before use.');
    }
    return dependencies;
  }

  async function ensureCart(buyerRef: string): Promise<void> {
    const now = new Date();
    await database.db
      .insert(demoEcommerceCarts)
      .values({ buyerRef, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
  }

  async function loadLines(buyerRef: string): Promise<readonly CartLine[]> {
    const rows = await database.db
      .select()
      .from(demoEcommerceCartItems)
      .where(eq(demoEcommerceCartItems.buyerRef, buyerRef))
      .orderBy(demoEcommerceCartItems.catalogItemId);

    const lines: CartLine[] = [];
    for (const row of rows) {
      let item: CatalogItem | undefined;
      let product: ProductDetails | undefined;
      try {
        [item, product] = await Promise.all([
          requireDependencies().catalog.findById(row.catalogItemId),
          requireDependencies().products.getByItemId(row.catalogItemId),
        ]);
      } catch (error) {
        if (isMissingProduct(error)) continue;
        throw error;
      }
      if (item === undefined || item.status !== 'active') continue;
      lines.push({
        itemId: row.catalogItemId,
        slug: item.slug,
        name: item.name,
        sku: product.sku,
        unitAmount: product.priceAmount,
        currency: product.currency,
        quantity: row.quantity,
        lineAmount: product.priceAmount * row.quantity,
      });
    }
    return lines;
  }

  async function buildCart(buyerRef: string): Promise<Cart> {
    const [lines, cartRow] = await Promise.all([
      loadLines(buyerRef),
      database.db
        .select()
        .from(demoEcommerceCarts)
        .where(eq(demoEcommerceCarts.buyerRef, buyerRef))
        .limit(1),
    ]);
    const first = lines[0];
    const totalAmount = lines.reduce((sum, line) => sum + line.lineAmount, 0);
    const current = cartRow[0];

    return {
      items: lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      totalAmount,
      ...(first === undefined ? {} : { currency: first.currency }),
      ...(current?.lastOrderId === null || current?.lastOrderId === undefined
        ? {}
        : { lastOrderId: current.lastOrderId }),
    };
  }

  async function clearAfterOrder(buyerRef: string, idempotencyKey: string, orderId: string) {
    const now = new Date();
    await database.transaction(async (tx) => {
      await tx.delete(demoEcommerceCartItems).where(eq(demoEcommerceCartItems.buyerRef, buyerRef));
      await tx
        .update(demoEcommerceCarts)
        .set({
          lastIdempotencyKey: idempotencyKey,
          lastOrderId: orderId,
          updatedAt: now,
        })
        .where(eq(demoEcommerceCarts.buyerRef, buyerRef));
    });
  }

  const service: BoundCartService = {
    bind(next) {
      dependencies = next;
    },

    async get(buyerRef) {
      return buildCart(buyerRef);
    },

    async setItem(buyerRef, itemId, quantity) {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
        throw invalidQuantity(maxQuantity);
      }
      const deps = requireDependencies();
      const item = await deps.catalog.getById(itemId);
      if (item.status !== 'active') {
        throw new HttpError({
          status: 409,
          code: 'CONFLICT',
          message: 'Only active catalog items can be added to the cart.',
        });
      }
      await deps.products.getByItemId(itemId);
      await ensureCart(buyerRef);
      const now = new Date();
      await database.db
        .insert(demoEcommerceCartItems)
        .values({
          buyerRef,
          catalogItemId: itemId,
          quantity,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [demoEcommerceCartItems.buyerRef, demoEcommerceCartItems.catalogItemId],
          set: { quantity, updatedAt: now },
        });
      return buildCart(buyerRef);
    },

    async removeItem(buyerRef, itemId) {
      await database.db
        .delete(demoEcommerceCartItems)
        .where(
          and(
            eq(demoEcommerceCartItems.buyerRef, buyerRef),
            eq(demoEcommerceCartItems.catalogItemId, itemId),
          ),
        );
      return buildCart(buyerRef);
    },

    async checkout(buyerRef, idempotencyKey) {
      if (idempotencyKey.length === 0 || idempotencyKey.length > 200) {
        throw validationError([
          { path: 'headers.idempotency-key', message: 'A valid idempotency key is required.' },
        ]);
      }
      const cart = await buildCart(buyerRef);
      if (cart.items.length === 0) {
        const [cartRow] = await database.db
          .select()
          .from(demoEcommerceCarts)
          .where(eq(demoEcommerceCarts.buyerRef, buyerRef))
          .limit(1);
        if (cartRow?.lastIdempotencyKey === idempotencyKey && cartRow.lastOrderId !== null) {
          const order = await requireDependencies().orders.getById(
            cartRow.lastOrderId,
            { kind: 'user', id: buyerRef },
            false,
          );
          return { order, cartCleared: true };
        }
        throw validationError([{ path: 'body', message: 'The cart is empty.' }]);
      }

      const deps = requireDependencies();
      const order = await deps.orders.create(
        {
          items: cart.items.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
        },
        {
          buyer: { kind: 'user', id: buyerRef },
          idempotencyKey,
        },
      );
      try {
        await clearAfterOrder(buyerRef, idempotencyKey, order.id);
        return { order, cartCleared: true };
      } catch (error) {
        // The order is already committed. Return it with an explicit cleanup
        // flag so the browser can retry the same key instead of showing a false
        // failure or silently leaving a stale cart.
        console.error('Cart cleanup failed after order confirmation.', error);
        return { order, cartCleared: false };
      }
    },
  };

  return service;
}
