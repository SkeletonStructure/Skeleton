import type { CatalogApi } from '@skeletonstructure/module-catalog';
import type { BuyerRef, Order, OrdersService } from '@skeletonstructure/module-orders';
import type { ProductsApi } from '@skeletonstructure/module-products';

export interface DemoBuyerContextPort {
  readonly currentBuyer: (request: {
    readonly principal?: { readonly id?: string };
  }) => Promise<BuyerRef>;
}

export interface CartLine {
  readonly itemId: string;
  readonly slug: string;
  readonly name: string;
  readonly sku: string;
  readonly unitAmount: number;
  readonly currency: string;
  readonly quantity: number;
  readonly lineAmount: number;
}

export interface Cart {
  readonly items: readonly CartLine[];
  readonly itemCount: number;
  readonly totalAmount: number;
  readonly currency?: string;
  readonly lastOrderId?: string;
}

export interface CheckoutResult {
  /** The confirmed order returned by the shared orders module. */
  readonly order: Order;
  /**
   * False only when order persistence succeeded but cart cleanup failed. The
   * caller can safely retry with the same idempotency key; the shared orders
   * module returns the same order and cart cleanup is retried.
   */
  readonly cartCleared: boolean;
}

export interface CartService {
  readonly get: (buyerRef: string) => Promise<Cart>;
  readonly setItem: (buyerRef: string, itemId: string, quantity: number) => Promise<Cart>;
  readonly removeItem: (buyerRef: string, itemId: string) => Promise<Cart>;
  readonly checkout: (buyerRef: string, idempotencyKey: string) => Promise<CheckoutResult>;
}

export interface CartDependencies {
  readonly catalog: CatalogApi;
  readonly products: ProductsApi;
  readonly orders: OrdersService;
  readonly buyerContext: DemoBuyerContextPort;
}

export interface CartConfig {
  readonly maxQuantity: number;
}
