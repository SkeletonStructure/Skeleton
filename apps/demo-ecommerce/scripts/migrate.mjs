import { fileURLToPath } from 'node:url';

import { runApplicationMigrations } from '@skeletonstructure/app-composition';

import { runDemoEcommerceMigrations } from '../dist/src/server/index.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

try {
  const { appliedCount } = await runApplicationMigrations({
    cwd: appRoot,
    migrate: runDemoEcommerceMigrations,
  });
  console.log(
    appliedCount === 0
      ? 'Database is up to date.'
      : `Migration complete (${appliedCount} applied).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
}
