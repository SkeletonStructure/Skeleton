import { loadConfig } from '@skeletonstructure/core/config';
import {
  closeDatabase,
  initializeDatabase,
  runDatabaseMigrations,
} from '@skeletonstructure/core/database';

const [group, command] = process.argv.slice(2);

if (group !== 'db' || command !== 'migrate') {
  console.error('Usage: node scripts/skeleton.mjs db migrate');
  process.exitCode = 2;
} else {
  try {
    const config = await loadConfig({ cwd: process.cwd() });
    await initializeDatabase(config.database);
    const report = await runDatabaseMigrations();

    console.log(
      report.upToDate
        ? 'Database is up to date.'
        : `Database migration complete (${report.appliedCount} applied).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database command failed.');
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
