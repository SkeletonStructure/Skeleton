export type CatalogItemId = string;

export type CatalogItemStatus = 'active' | 'archived';

export interface CatalogItem {
  readonly id: CatalogItemId;
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly status: CatalogItemStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCatalogItemInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
}

export interface UpdateCatalogItemInput {
  readonly slug?: string;
  readonly name?: string;
  readonly description?: string | null;
}

export interface CatalogItemPage {
  readonly items: readonly CatalogItem[];
  readonly nextCursor?: string;
}

export interface ListCatalogItemsInput {
  readonly limit: number;
  readonly cursor?: string;
  readonly status?: CatalogItemStatus;
}

/**
 * Generic extension seam. Catalog never imports an extension module; an
 * application passes loaders for the extensions it has enabled.
 */
export interface CatalogExpansionProvider {
  readonly kind: string;
  load(itemId: CatalogItemId): Promise<Record<string, unknown> | undefined>;
}

export interface CatalogConfig {
  readonly publicRead: boolean;
}

export interface CatalogApi {
  findById(id: CatalogItemId): Promise<CatalogItem | undefined>;
  getById(id: CatalogItemId): Promise<CatalogItem>;
  list(input: ListCatalogItemsInput): Promise<CatalogItemPage>;
  create(input: CreateCatalogItemInput): Promise<CatalogItem>;
  update(id: CatalogItemId, input: UpdateCatalogItemInput): Promise<CatalogItem>;
  archive(id: CatalogItemId): Promise<CatalogItem>;
}
