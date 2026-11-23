import { runM8Migrations } from '@skeletonstructure/app-composition';
import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, getDatabase, initializeDatabase } from '@skeletonstructure/core/database';

const config = await loadConfig({ cwd: process.cwd() });

try {
  await initializeDatabase(config.database);
  const report = await runM8Migrations(getDatabase());
  const total = Object.values(report).reduce(
    (sum, entry) => sum + (typeof entry?.appliedCount === 'number' ? entry.appliedCount : 0),
    0,
  );
  console.log(
    total === 0 ? 'Database is up to date.' : `Database migration complete (${total} applied).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
