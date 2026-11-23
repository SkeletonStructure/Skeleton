// Generated from openapi/demo-openapi.json. Do not edit.
// Source SHA-256: 7fa8851b9d7ea9774cfc6fed1db0dc08c47fe3f66ba7daeb76167895730e5553

export interface DemoCartLine {
  readonly itemId: string;
  readonly slug: string;
  readonly name: string;
  readonly sku: string;
  readonly unitAmount: number;
  readonly currency: string;
  readonly quantity: number;
  readonly lineAmount: number;
}

export interface DemoCart {
  readonly items: readonly DemoCartLine[];
  readonly itemCount: number;
  readonly totalAmount: number;
  readonly currency?: string;
  readonly lastOrderId?: string;
}

export interface DemoOrderSnapshot {
  readonly id: string;
  readonly status: string;
  readonly items: readonly Record<string, unknown>[];
  readonly totalAmount?: number;
  readonly currency?: string;
}

export interface DemoCheckoutResult {
  readonly order: DemoOrderSnapshot;
  readonly cartCleared: boolean;
}

export const DEMO_CART_PATHS = {
  getCart: '/v1/cart',
  setItem: '/v1/cart/items/{itemId}',
  removeItem: '/v1/cart/items/{itemId}',
  checkout: '/v1/cart/checkout',
} as const;
