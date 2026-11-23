import { HttpError, validationError } from '@skeletonstructure/core/api';
import type { Database } from '@skeletonstructure/core/database';
import { and, desc, eq, lt, or } from 'drizzle-orm';

import { catalogItems } from './schema.js';
import type {
  CatalogApi,
  CatalogItem,
  CatalogItemId,
  CreateCatalogItemInput,
  ListCatalogItemsInput,
  UpdateCatalogItemInput,
} from './types.js';
import { decodeCursor, encodeCursor, isUniqueViolation, newPrefixedId } from './util.js';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function present(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

function toCatalogItem(row: typeof catalogItems.$inferSelect): CatalogItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    status: row.status as CatalogItem['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateCreateInput(input: CreateCatalogItemInput): void {
  const details: { path: string; message: string }[] = [];
  if (!SLUG_PATTERN.test(input.slug) || input.slug.length > 100) {
    details.push({ path: 'body.slug', message: 'Use lowercase letters, numbers, and hyphens.' });
  }
  if (input.name.trim().length === 0 || input.name.length > 200) {
    details.push({ path: 'body.name', message: 'Name must be 1 to 200 characters.' });
  }
  if (input.description !== undefined && input.description.length > 2000) {
    details.push({
      path: 'body.description',
      message: 'Description must be at most 2000 characters.',
    });
  }
  if (details.length > 0) throw validationError(details);
}

function validateUpdateInput(input: UpdateCatalogItemInput): void {
  const details: { path: string; message: string }[] = [];
  if (input.slug !== undefined && (!SLUG_PATTERN.test(input.slug) || input.slug.length > 100)) {
    details.push({ path: 'body.slug', message: 'Use lowercase letters, numbers, and hyphens.' });
  }
  if (input.name !== undefined && (input.name.trim().length === 0 || input.name.length > 200)) {
    details.push({ path: 'body.name', message: 'Name must be 1 to 200 characters.' });
  }
  if (
    input.description !== undefined &&
    input.description !== null &&
    input.description.length > 2000
  ) {
    details.push({
      path: 'body.description',
      message: 'Description must be at most 2000 characters.',
    });
  }
  if (details.length > 0) throw validationError(details);
}

export function createCatalogService(database: Database): CatalogApi {
  const db = database.db;

  return {
    async findById(id: CatalogItemId) {
      const [row] = await db.select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1);
      return row === undefined ? undefined : toCatalogItem(row);
    },

    async getById(id: CatalogItemId) {
      const item = await this.findById(id);
      if (item === undefined) {
        throw new HttpError({ status: 404, code: 'NOT_FOUND', message: 'Catalog item not found.' });
      }
      return item;
    },

    async list(input: ListCatalogItemsInput) {
      const position = decodeCursor(input.cursor);
      const filters = [
        input.status === undefined ? undefined : eq(catalogItems.status, input.status),
        position === undefined
          ? undefined
          : or(
              lt(catalogItems.createdAt, new Date(position.createdAt)),
              and(
                eq(catalogItems.createdAt, new Date(position.createdAt)),
                lt(catalogItems.id, position.id),
              ),
            ),
      ].filter((condition) => condition !== undefined);

      const rows = await db
        .select()
        .from(catalogItems)
        .where(filters.length === 0 ? undefined : and(...filters))
        .orderBy(desc(catalogItems.createdAt), desc(catalogItems.id))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map(toCatalogItem),
        ...(hasMore && last === undefined
          ? {}
          : hasMore && last !== undefined
            ? { nextCursor: encodeCursor(last.createdAt, last.id) }
            : {}),
      };
    },

    async create(input: CreateCatalogItemInput) {
      validateCreateInput(input);
      const now = new Date();
      const row = {
        id: newPrefixedId('cat'),
        slug: input.slug.trim(),
        name: input.name.trim(),
        description: input.description ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      try {
        await db.insert(catalogItems).values(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError({
            status: 409,
            code: 'CONFLICT',
            message: 'A catalog item with that slug already exists.',
          });
        }
        throw error;
      }
      return toCatalogItem({ ...row, description: row.description ?? null });
    },

    async update(id: CatalogItemId, input: UpdateCatalogItemInput) {
      validateUpdateInput(input);
      const current = await this.getById(id);
      const next = {
        slug: input.slug?.trim() ?? current.slug,
        name: input.name?.trim() ?? current.name,
        description:
          input.description === null
            ? null
            : input.description === undefined
              ? (current.description ?? null)
              : input.description,
        updatedAt: new Date(),
      };
      try {
        await db.update(catalogItems).set(next).where(eq(catalogItems.id, id));
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError({
            status: 409,
            code: 'CONFLICT',
            message: 'A catalog item with that slug already exists.',
          });
        }
        throw error;
      }
      const { description, ...rest } = next;
      return {
        ...current,
        ...rest,
        ...(description === null ? {} : { description }),
      };
    },

    async archive(id: CatalogItemId) {
      const current = await this.getById(id);
      const updatedAt = new Date();
      await db
        .update(catalogItems)
        .set({ status: 'archived', updatedAt })
        .where(eq(catalogItems.id, id));
      return { ...current, status: 'archived' as const, updatedAt };
    },
  };
}

export { present as catalogDescriptionOrUndefined };
