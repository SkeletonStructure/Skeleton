import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, initializeDatabase } from '@skeletonstructure/core/database';
import { createAuthService, createConsoleEmailProvider } from '@skeletonstructure/module-auth';
import { createUsersService } from '@skeletonstructure/module-users';

const config = await loadConfig({ cwd: process.cwd() });

try {
  const database = await initializeDatabase(config.database);
  const auth = createAuthService({
    appConfig: config,
    database,
    users: createUsersService(database.db),
    emailProvider: createConsoleEmailProvider(),
  });
  const report = await auth.cleanupExpired();
  console.log(
    `Session cleanup complete: ${report.sessionsDeleted} sessions, ${report.resetTokensDeleted} reset tokens removed.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Session cleanup failed.');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
