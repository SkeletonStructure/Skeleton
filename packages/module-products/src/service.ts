import { HttpError, validationError } from '@skeletonstructure/core/api';
import type { Database } from '@skeletonstructure/core/database';
import {
  type CatalogApi,
  type CatalogExpansionProvider,
  type CatalogItemId,
  type ItemSnapshot,
  isUniqueViolation,
  type Money,
  type PriceContext,
  type PriceResolverPort,
} from '@skeletonstructure/module-catalog';
import { eq } from 'drizzle-orm';

import { commerceProducts } from './schema.js';
import type { ProductDetails, ProductsApi, UpdateProductInput } from './types.js';

export const PRODUCT_EXTENSION_KIND = 'product';
export const PRODUCT_DETAILS_SCHEMA_VERSION = 1;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;

function present(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

function toProductDetails(row: typeof commerceProducts.$inferSelect): ProductDetails {
  return {
    itemId: row.catalogItemId,
    sku: row.sku,
    priceAmount: row.priceAmount,
    currency: row.currency,
    ...(row.weightGrams === null ? {} : { weightGrams: row.weightGrams }),
    ...(row.shippingClass === null ? {} : { shippingClass: row.shippingClass }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateInput(input: UpdateProductInput, defaultCurrency: string): string {
  const details: { path: string; message: string }[] = [];
  if (!SKU_PATTERN.test(input.sku)) {
    details.push({
      path: 'body.sku',
      message: 'SKU must be 2 to 64 letters, numbers, dots, dashes, or underscores.',
    });
  }
  if (!Number.isInteger(input.priceAmount) || input.priceAmount < 0) {
    details.push({
      path: 'body.priceAmount',
      message: 'Price must be a non-negative integer in minor units.',
    });
  }
  const currency = input.currency ?? defaultCurrency;
  if (!CURRENCY_PATTERN.test(currency)) {
    details.push({
      path: 'body.currency',
      message: 'Currency must be a three-letter uppercase code.',
    });
  }
  if (
    input.weightGrams !== undefined &&
    (!Number.isInteger(input.weightGrams) || input.weightGrams < 0)
  ) {
    details.push({ path: 'body.weightGrams', message: 'Weight must be a non-negative integer.' });
  }
  if (input.shippingClass !== undefined && input.shippingClass.length > 100) {
    details.push({
      path: 'body.shippingClass',
      message: 'Shipping class must be at most 100 characters.',
    });
  }
  if (details.length > 0) throw validationError(details);
  return currency;
}

export interface CreateProductsServiceOptions {
  readonly database: Database;
  readonly catalog: CatalogApi;
  readonly defaultCurrency: string;
}

export function createProductsService(options: CreateProductsServiceOptions): ProductsApi {
  const db = options.database.db;

  async function getByItemId(itemId: CatalogItemId): Promise<ProductDetails> {
    const [row] = await db
      .select()
      .from(commerceProducts)
      .where(eq(commerceProducts.catalogItemId, itemId))
      .limit(1);
    if (row === undefined) {
      throw new HttpError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Product details not found.',
      });
    }
    return toProductDetails(row);
  }

  const api: ProductsApi = {
    getByItemId,

    async upsert(itemId: CatalogItemId, input: UpdateProductInput) {
      await options.catalog.getById(itemId);
      const currency = validateInput(input, options.defaultCurrency);
      const now = new Date();
      const values = {
        catalogItemId: itemId,
        sku: input.sku.trim(),
        priceAmount: input.priceAmount,
        currency,
        weightGrams: input.weightGrams ?? null,
        shippingClass: input.shippingClass ?? null,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await db
          .insert(commerceProducts)
          .values(values)
          .onConflictDoUpdate({
            target: commerceProducts.catalogItemId,
            set: {
              sku: values.sku,
              priceAmount: values.priceAmount,
              currency: values.currency,
              weightGrams: values.weightGrams,
              shippingClass: values.shippingClass,
              updatedAt: values.updatedAt,
            },
          });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError({
            status: 409,
            code: 'CONFLICT',
            message: 'A product with that SKU already exists.',
          });
        }
        throw error;
      }
      return toProductDetails({ ...values, createdAt: now, updatedAt: now });
    },

    async resolve(itemId: CatalogItemId, _context: PriceContext): Promise<Money> {
      const product = await getByItemId(itemId);
      return { amount: product.priceAmount, currency: product.currency };
    },

    async snapshot(itemId: CatalogItemId): Promise<ItemSnapshot> {
      const [product, item] = await Promise.all([
        getByItemId(itemId),
        options.catalog.getById(itemId),
      ]);
      if (item.status !== 'active') {
        throw new HttpError({
          status: 409,
          code: 'CONFLICT',
          message: 'Only active catalog items can be purchased.',
        });
      }
      return {
        itemId,
        name: item.name,
        unitAmount: product.priceAmount,
        currency: product.currency,
        extensionKind: PRODUCT_EXTENSION_KIND,
        detailsSchemaVersion: PRODUCT_DETAILS_SCHEMA_VERSION,
        details: {
          sku: product.sku,
          ...(product.shippingClass === undefined ? {} : { shippingClass: product.shippingClass }),
        },
      };
    },
  };

  return api;
}

export function createProductExpansionProvider(products: ProductsApi): CatalogExpansionProvider {
  return {
    kind: PRODUCT_EXTENSION_KIND,
    async load(itemId) {
      try {
        const product = await products.getByItemId(itemId);
        return {
          sku: product.sku,
          priceAmount: product.priceAmount,
          currency: product.currency,
          ...(product.weightGrams === undefined ? {} : { weightGrams: product.weightGrams }),
          ...(product.shippingClass === undefined ? {} : { shippingClass: product.shippingClass }),
        };
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) return undefined;
        throw error;
      }
    },
  };
}

export type PriceResolver = PriceResolverPort;
export { present as productDescriptionOrUndefined };
