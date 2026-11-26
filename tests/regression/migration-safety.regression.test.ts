import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.pnpm',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

function repoPath(relative: string): string {
  return relative === '' ? repoRoot : join(repoRoot, ...relative.split('/'));
}

async function discoverSqlFiles(directory = ''): Promise<readonly string[]> {
  const found: string[] = [];
  const entries = await readdir(repoPath(directory), { withFileTypes: true });

  for (const entry of entries) {
    const relative = directory === '' ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        found.push(...(await discoverSqlFiles(relative)));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.sql')) found.push(relative);
  }

  return found.sort();
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const DESTRUCTIVE_STATEMENTS = [
  /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|MATERIALIZED\s+VIEW|VIEW|SCHEMA|FUNCTION|TRIGGER|TYPE|SEQUENCE|DATABASE|ROLE|USER|OWNED|ALL)\b/i,
  /\bTRUNCATE(?:\s+TABLE)?\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+COLUMN\b/i,
  /\bRENAME\b/i,
] as const;

function destructiveStatement(sql: string): boolean {
  const statements = stripComments(sql);
  return DESTRUCTIVE_STATEMENTS.some((pattern) => pattern.test(statements));
}

describe('migration safety regressions', () => {
  it('discovers every SQL migration and rejects destructive DDL', async () => {
    const files = await discoverSqlFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      expect(file, `${file} is outside a migrations directory`).toMatch(
        /\/migrations\/[^/]+\.sql$/,
      );
      const sql = await readFile(repoPath(file), 'utf8');
      expect(destructiveStatement(sql), `${file} contains destructive DDL`).toBe(false);
    }

    for (const sample of [
      'DROP TABLE "users_users";',
      'ALTER TABLE "users_users" DROP COLUMN "email";',
      'ALTER TABLE "users_users" DROP CONSTRAINT "users_email_unique";',
      'TRUNCATE TABLE "users_users";',
      'DELETE FROM "users_users";',
      'ALTER TABLE "users_users" ALTER COLUMN "email" SET NOT NULL;',
      'ALTER TABLE "users_users" RENAME TO "accounts";',
    ]) {
      expect(destructiveStatement(sample), sample).toBe(true);
    }

    expect(
      destructiveStatement(
        'ALTER TABLE "users_users" ADD CONSTRAINT "fk" FOREIGN KEY ("id") REFERENCES "other"("id") ON DELETE cascade;',
      ),
    ).toBe(false);
    expect(destructiveStatement('INSERT INTO "users_role_permissions" VALUES (\'user\');')).toBe(
      false,
    );
  });

  it('preserves uniqueness and ownership safeguards in module migrations', async () => {
    const orders = await readFile(
      repoPath('packages/module-orders/migrations/0000_flaky_outlaw_kid.sql'),
      'utf8',
    );
    const catalog = await readFile(
      repoPath('packages/module-catalog/migrations/0000_fine_namorita.sql'),
      'utf8',
    );
    const products = await readFile(
      repoPath('packages/module-products/migrations/0000_volatile_risque.sql'),
      'utf8',
    );
    const users = await readFile(
      repoPath('packages/module-users/migrations/0000_lush_wendell_rand.sql'),
      'utf8',
    );

    expect(orders).toContain('orders_orders_buyer_idempotency_key_unique');
    expect(orders).toContain('orders_order_items_order_position_unique');
    expect(catalog).toContain('catalog_items_slug_unique');
    expect(products).toContain('commerce_products_sku_unique');
    expect(users).toContain('users_users_email_unique');
  });

  it('keeps application tables out of the core baseline', async () => {
    const baseline = await readFile(
      repoPath('packages/core/migrations/0000_core_baseline.sql'),
      'utf8',
    );

    for (const table of [
      'users_users',
      'auth_sessions',
      'catalog_items',
      'commerce_products',
      'inventory_items',
      'orders_orders',
    ]) {
      expect(baseline).not.toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('preserves the immutable v0.1.0 migration baseline', async () => {
    const manifest = JSON.parse(
      await readFile(repoPath('docs/compatibility/v0.1.0-migrations.json'), 'utf8'),
    ) as Record<string, string>;
    const current = new Set(await discoverSqlFiles());

    for (const [file, expectedHash] of Object.entries(manifest)) {
      expect(current.has(file), `${file} is missing`).toBe(true);
      const sql = await readFile(repoPath(file));
      expect(createHash('sha256').update(sql).digest('hex'), file).toBe(expectedHash);
    }
  });
});
