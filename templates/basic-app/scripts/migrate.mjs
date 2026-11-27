import { fileURLToPath } from 'node:url';

import { runApplicationMigrations } from '@skeletonstructure/app-composition';

import { runBasicAppMigrations } from '../dist/src/server.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

try {
  const { appliedCount } = await runApplicationMigrations({
    cwd: appRoot,
    migrate: runBasicAppMigrations,
  });
  console.log(
    appliedCount === 0
      ? 'Database is up to date.'
      : `Database migration complete (${appliedCount} applied).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
}
