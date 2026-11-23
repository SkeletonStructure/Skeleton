import { fileURLToPath } from 'node:url';

import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, getDatabase, initializeDatabase } from '@skeletonstructure/core/database';

import { runDemoEcommerceMigrations } from '../dist/src/server/index.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const config = await loadConfig({ cwd: appRoot });

try {
  await initializeDatabase(config.database);
  const report = await runDemoEcommerceMigrations(getDatabase());
  const total = Object.values(report).reduce(
    (sum, entry) => sum + (typeof entry?.appliedCount === 'number' ? entry.appliedCount : 0),
    0,
  );
  console.log(total === 0 ? 'Database is up to date.' : `Migration complete (${total} applied).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
