import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createMigrationReadinessCheck,
  readExpectedMigrationHashes,
} from '../../src/database/migration-readiness.js';
import type { Database } from '../../src/database/types.js';

function fakeDatabase(hashes: readonly string[], fail = false): Database {
  return {
    db: {
      execute: async () => {
        if (fail) throw new Error('connection string with secret');
        return { rows: hashes.map((hash) => ({ hash })) };
      },
    },
  } as unknown as Database;
}

describe('migration readiness', () => {
  it('derives expected hashes from an explicit migration folder', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'skeleton-migration-readiness-'));
    try {
      const sql = 'CREATE TABLE readiness_probe (id integer);\n';
      mkdirSync(join(folder, 'meta'));
      writeFileSync(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({
          version: '7',
          dialect: 'postgresql',
          entries: [{ idx: 0, version: '7', when: 1, tag: '0000_probe', breakpoints: true }],
        }),
      );
      writeFileSync(join(folder, '0000_probe.sql'), sql);

      const hash = createHash('sha256').update(sql).digest('hex');
      expect(readExpectedMigrationHashes([folder])).toEqual([hash]);

      const applied = createMigrationReadinessCheck({
        database: fakeDatabase([hash]),
        migrationsFolders: [folder],
      });
      expect(applied.id).toBe('migration');
      await expect(applied.check()).resolves.toEqual({ status: 'ok' });

      const pending = createMigrationReadinessCheck({
        database: fakeDatabase([]),
        migrationsFolders: [folder],
      });
      await expect(pending.check()).resolves.toEqual({
        status: 'error',
        reason: 'MIGRATIONS_PENDING',
      });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('returns a safe reason when applied migration state cannot be read', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'skeleton-migration-readiness-'));
    try {
      mkdirSync(join(folder, 'meta'));
      writeFileSync(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({ entries: [{ tag: '0000_probe', when: 1 }] }),
      );
      writeFileSync(join(folder, '0000_probe.sql'), 'SELECT 1;\n');

      const check = createMigrationReadinessCheck({
        database: fakeDatabase([], true),
        migrationsFolders: [folder],
      });
      const result = await check.check();
      expect(result).toEqual({ status: 'error', reason: 'MIGRATIONS_PENDING' });
      expect(JSON.stringify(result)).not.toContain('secret');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
