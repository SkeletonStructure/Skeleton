import type { ItemSnapshot } from '@skeletonstructure/module-catalog';

export const BUYER_CONTEXT_PORT = { id: 'buyer-context', version: 1 } as const;

export interface BuyerRequestPrincipal {
  readonly id?: string;
}

export interface BuyerRequest {
  readonly principal?: BuyerRequestPrincipal;
}

export type BuyerRef =
  | { readonly kind: 'user'; readonly id: string }
  | { readonly kind: 'guest'; readonly tokenHash: string };

export interface OrderBuyerRef {
  readonly buyerKind: string;
  readonly buyerRef: string;
}

/** Implemented by `auth` + `users` in v0.1. Guest refs are future-only. */
export interface BuyerContextPort {
  currentBuyer(request: BuyerRequest): Promise<BuyerRef>;
  owns(order: OrderBuyerRef, buyer: BuyerRef): boolean;
}

export type OrderStatus = 'confirmed';

export interface OrderLine extends ItemSnapshot {
  readonly quantity: number;
}

export interface Order {
  readonly id: string;
  readonly status: OrderStatus;
  readonly buyer: BuyerRef;
  readonly items: readonly OrderLine[];
  readonly totalAmount: number;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateOrderLineInput {
  readonly itemId: string;
  readonly quantity: number;
  readonly unitAmount?: number;
  readonly currency?: string;
}

export interface CreateOrderInput {
  readonly items: readonly CreateOrderLineInput[];
}

export interface CreateOrderContext {
  readonly buyer: BuyerRef;
  readonly idempotencyKey?: string;
}

export interface ListOrdersInput {
  readonly buyer: BuyerRef;
  readonly limit: number;
  readonly cursor?: string;
}

export interface OrdersConfig {
  readonly requireIdempotencyKey: boolean;
}
