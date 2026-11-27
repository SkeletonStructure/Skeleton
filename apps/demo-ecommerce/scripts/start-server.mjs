import { fileURLToPath } from 'node:url';

import { createServer } from '@skeletonstructure/core/api';
import { loadConfig } from '@skeletonstructure/core/config';
import {
  closeDatabase,
  createDatabaseAuditSink,
  initializeDatabase,
} from '@skeletonstructure/core/database';
import { createLifecycle, createShutdownCoordinator } from '@skeletonstructure/core/lifecycle';
import { createLogger } from '@skeletonstructure/core/logging';

import { createDemoEcommerceComposition } from '../dist/src/server/index.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** Starts the demo API. Composition failures happen before `listen()`. */
export async function startServer() {
  const appConfig = await loadConfig({ cwd: appRoot });
  const logger = createLogger(appConfig.logging);
  const lifecycle = createLifecycle();
  let database;
  let coordinator;

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
      logger,
      lifecycle,
    });

    coordinator = createShutdownCoordinator({
      lifecycle,
      logger,
      close: async () => {
        try {
          await app.close();
        } finally {
          await closeDatabase();
        }
      },
    });
    coordinator.install();

    await app.listen({ host: appConfig.server.host, port: appConfig.server.port });
    lifecycle.markReady();
    logger.info('application.started', {
      host: appConfig.server.host,
      port: appConfig.server.port,
      env: appConfig.app.env,
    });
    return app;
  } catch (error) {
    coordinator?.uninstall();
    await closeDatabase();
    logger.error('application.start_failed', {
      errorName: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
    });
    throw error;
  }
}

const invokedDirectly = process.argv[1]?.endsWith('start-server.mjs');

if (invokedDirectly) {
  try {
    await startServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Application startup failed.');
    process.exitCode = 1;
  }
}
