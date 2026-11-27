import { fileURLToPath } from 'node:url';

import { createServer } from '@skeletonstructure/core/api';
import { loadConfig } from '@skeletonstructure/core/config';
import {
  closeDatabase,
  createDatabaseAuditSink,
  initializeDatabase,
} from '@skeletonstructure/core/database';

import { createDemoEcommerceComposition } from '../dist/src/server/index.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** Starts the demo API. Composition failures happen before `listen()`. */
export async function startServer() {
  const appConfig = await loadConfig({ cwd: appRoot });
  let database;

  try {
    database = await initializeDatabase(appConfig.database);
    const auditSink = createDatabaseAuditSink(database);
    const composition = await createDemoEcommerceComposition({
      appConfig,
      database,
      audit: auditSink,
    });
    const app = await createServer({
      appConfig,
      database,
      activationReport: composition.activationReport,
      routeHandlers: composition.routeHandlers,
      authenticator: composition.authenticator,
      csrfGuard: composition.csrfGuard,
      auditSink,
    });

    const shutdown = async (signal) => {
      try {
        await app.close();
      } finally {
        await closeDatabase();
        process.removeAllListeners(signal);
        process.kill(process.pid, signal);
      }
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    await app.listen({ host: appConfig.server.host, port: appConfig.server.port });
    return app;
  } catch (error) {
    await closeDatabase();
    throw error;
  }
}

const invokedDirectly = process.argv[1]?.endsWith('start-server.mjs');

if (invokedDirectly) {
  try {
    const app = await startServer();
    app.log.info('E-commerce demo API started.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Application startup failed.');
    process.exitCode = 1;
  }
}
