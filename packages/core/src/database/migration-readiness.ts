import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';

import type { ReadinessCheck } from '../api/types.js';
import type { Database } from './types.js';

const PENDING_REASON = 'MIGRATIONS_PENDING';
const JOURNAL_PATH = ['meta', '_journal.json'] as const;
const MIGRATION_TAG_PATTERN = /^[A-Za-z0-9_-]+$/;

interface JournalLike {
  readonly entries?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migrationTags(journalPath: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(journalPath, 'utf8')) as unknown;
  } catch {
    throw new Error('Invalid migration journal.');
  }

  if (!isObject(parsed)) throw new Error('Invalid migration journal.');
  const journal = parsed as JournalLike;
  if (!Array.isArray(journal.entries)) throw new Error('Invalid migration journal.');

  return journal.entries.map((entry: unknown) => {
    if (
      !isObject(entry) ||
      typeof entry.tag !== 'string' ||
      !MIGRATION_TAG_PATTERN.test(entry.tag)
    ) {
      throw new Error('Invalid migration journal entry.');
    }
    return entry.tag;
  });
}

/**
 * Computes the SHA-256 hashes Drizzle records for each SQL migration in the
 * supplied folders. No migration file is modified or executed here.
 */
export function readExpectedMigrationHashes(
  migrationsFolders: readonly string[],
): readonly string[] {
  const hashes = new Set<string>();

  for (const folder of migrationsFolders) {
    const journalPath = join(folder, ...JOURNAL_PATH);
    for (const tag of migrationTags(journalPath)) {
      const sqlPath = join(folder, `${tag}.sql`);
      let contents: string;
      try {
        contents = readFileSync(sqlPath, 'utf8');
      } catch {
        throw new Error(`Migration file is unavailable for tag "${tag}".`);
      }
      hashes.add(createHash('sha256').update(contents).digest('hex'));
    }
  }

  return [...hashes];
}

function resultRows(result: unknown): readonly unknown[] {
  if (Array.isArray(result)) return result;
  if (isObject(result) && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function readAppliedMigrationHashes(database: Database): Promise<ReadonlySet<string>> {
  const result: unknown = await database.db.execute(
    sql`SELECT hash FROM "drizzle"."__drizzle_migrations"`,
  );

  const hashes = new Set<string>();
  for (const row of resultRows(result)) {
    if (isObject(row) && typeof row.hash === 'string') hashes.add(row.hash);
  }
  return hashes;
}

export interface MigrationReadinessOptions {
  readonly database: Database;
  /** Explicit migration folders owned by the application and its modules. */
  readonly migrationsFolders: readonly string[];
  readonly checkId?: string;
}

/**
 * Builds an opt-in readiness check that fails closed when the database has not
 * applied every expected migration. Results expose only a fixed reason code.
 */
export function createMigrationReadinessCheck(options: MigrationReadinessOptions): ReadinessCheck {
  const expected = readExpectedMigrationHashes(options.migrationsFolders);
  const id = options.checkId ?? 'migration';

  return {
    id,
    check: async () => {
      try {
        const applied = await readAppliedMigrationHashes(options.database);
        const pending = expected.some((hash) => !applied.has(hash));
        return pending ? { status: 'error', reason: PENDING_REASON } : { status: 'ok' };
      } catch {
        return { status: 'error', reason: PENDING_REASON };
      }
    },
  };
}
