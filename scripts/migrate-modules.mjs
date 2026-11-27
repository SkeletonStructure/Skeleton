import { runApplicationMigrations, runM8Migrations } from '@skeletonstructure/app-composition';

try {
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
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
}
