import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

let container: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();
}, 180_000);

afterAll(async () => {
  await container?.stop();
}, 60_000);

async function runMigration(): Promise<string> {
  if (container === undefined) throw new Error('PostgreSQL container is unavailable.');

  const { stdout, stderr } = await execFileAsync(pnpmCommand, ['db:migrate'], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: container.getConnectionUri(), NODE_ENV: 'test' },
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
  });
  return `${stdout}\n${stderr}`;
}

describe('database migration CLI smoke regression', () => {
  it('applies every module migration through pnpm db:migrate and reports a no-op re-run', async () => {
    const firstRun = await runMigration();
    expect(firstRun).toContain('Database migration complete');

    const secondRun = await runMigration();
    expect(secondRun).toContain('Database is up to date.');
  }, 360_000);
});
