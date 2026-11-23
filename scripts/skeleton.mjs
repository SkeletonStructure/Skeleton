import { startServer } from './start-server.mjs';

const [group, command] = process.argv.slice(2);

if (group === 'start' && command === undefined) {
  try {
    const app = await startServer();
    app.log.info('M8 application started.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Application startup failed.');
    process.exitCode = 1;
  }
} else if (group !== 'db' || command !== 'migrate') {
  console.error('Usage: node scripts/skeleton.mjs db migrate | node scripts/skeleton.mjs start');
  process.exitCode = 2;
} else {
  const { runM8Migrations } = await import('@skeletonstructure/app-composition');
  const { loadConfig } = await import('@skeletonstructure/core/config');
  const { closeDatabase, getDatabase, initializeDatabase } = await import(
    '@skeletonstructure/core/database'
  );

  try {
    const config = await loadConfig({ cwd: process.cwd() });
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
    console.error(error instanceof Error ? error.message : 'Database command failed.');
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
