import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { PoolClientLike } from './types.js';

const SOURCE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations/', import.meta.url));
const BUILT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../migrations/', import.meta.url));

const MIGRATION_LOCK_NAMESPACE = 1_934_793_174;
const MIGRATION_LOCK_KEY = 1;

export function defaultMigrationsFolder(): string {
  for (const candidate of [BUILT_MIGRATIONS_FOLDER, SOURCE_MIGRATIONS_FOLDER]) {
    if (existsSync(candidate)) return candidate;
  }
  return SOURCE_MIGRATIONS_FOLDER;
}

export async function withMigrationAdvisoryLock<T>(
  client: PoolClientLike,
  operation: () => Promise<T>,
): Promise<T> {
  const lockValues = [MIGRATION_LOCK_NAMESPACE, MIGRATION_LOCK_KEY] as const;
  await client.query('SELECT pg_advisory_lock($1, $2)', lockValues);

  try {
    return await operation();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', lockValues);
  }
}

function firstRow(result: unknown): unknown {
  if (Array.isArray(result)) return result[0];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: readonly unknown[] }).rows;
    return rows?.[0];
  }
  return undefined;
}

export async function countAppliedMigrations(client: PoolClientLike): Promise<number> {
  let result: unknown;
  try {
    result = await client.query(
      'SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations"',
    );
  } catch {
    return 0;
  }

  const row = firstRow(result);
  if (typeof row !== 'object' || row === null || !('count' in row)) return 0;

  const count = (row as { count?: unknown }).count;
  if (typeof count === 'number' && Number.isInteger(count)) return count;
  if (typeof count === 'string' && /^\d+$/.test(count)) return Number(count);
  return 0;
}
