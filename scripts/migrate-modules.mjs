import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, getDatabase, initializeDatabase } from '@skeletonstructure/core/database';
import { runAuthUsersMigrations } from '@skeletonstructure/module-auth';

const config = await loadConfig({ cwd: process.cwd() });

try {
  await initializeDatabase(config.database);
  const report = await runAuthUsersMigrations(getDatabase());
  const total = report.core.appliedCount + report.users.appliedCount + report.auth.appliedCount;
  console.log(
    total === 0 ? 'Database is up to date.' : `Database migration complete (${total} applied).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
