import {
  createM8Composition,
  type M8Composition,
  type M8CompositionOptions,
  m8MigrationFolders,
  runM8Migrations,
} from '@skeletonstructure/app-composition';
import type { Database } from '@skeletonstructure/core/database';

/** Replace this with an app-local composer to add modules via `additionalModules`. */
export function createBasicAppComposition(options: M8CompositionOptions): Promise<M8Composition> {
  return createM8Composition(options);
}

export function runBasicAppMigrations(database: Database) {
  return runM8Migrations(database);
}

/** Explicit folders let readiness detect missing shared and app-local migrations. */
export const basicAppMigrationFolders: readonly string[] = m8MigrationFolders();
