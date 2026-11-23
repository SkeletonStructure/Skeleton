import type { CatalogItemId, PriceResolverPort } from '@skeletonstructure/module-catalog';

export interface ProductConfig {
  readonly defaultCurrency: string;
}

export interface ProductDetails {
  readonly itemId: CatalogItemId;
  readonly sku: string;
  readonly priceAmount: number;
  readonly currency: string;
  readonly weightGrams?: number;
  readonly shippingClass?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProductInput {
  readonly sku: string;
  readonly priceAmount: number;
  readonly currency?: string;
  readonly weightGrams?: number;
  readonly shippingClass?: string;
}

export type UpdateProductInput = CreateProductInput;

export interface ProductsApi extends PriceResolverPort {
  getByItemId(itemId: CatalogItemId): Promise<ProductDetails>;
  upsert(itemId: CatalogItemId, input: UpdateProductInput): Promise<ProductDetails>;
}
