import { startServer } from './start-server.mjs';

const [group, command] = process.argv.slice(2);

if (group === 'start' && command === undefined) {
  try {
    const runtime = await startServer();
    runtime.app.log.info('M8 application started.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Application startup failed.');
    process.exitCode = 1;
  }
} else if (group !== 'db' || command !== 'migrate') {
  console.error('Usage: node scripts/skeleton.mjs db migrate | node scripts/skeleton.mjs start');
  process.exitCode = 2;
} else {
  try {
    const { runApplicationMigrations, runM8Migrations } = await import(
      '@skeletonstructure/app-composition'
    );
    const { appliedCount } = await runApplicationMigrations({
      cwd: process.cwd(),
      migrate: runM8Migrations,
    });

    console.log(
      appliedCount === 0
        ? 'Database is up to date.'
        : `Database migration complete (${appliedCount} applied).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database command failed.');
    process.exitCode = 1;
  }
}
