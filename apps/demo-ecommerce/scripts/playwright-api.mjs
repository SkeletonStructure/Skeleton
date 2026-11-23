import { fileURLToPath } from 'node:url';

import { createServer } from '@skeletonstructure/core/api';
import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, initializeDatabase } from '@skeletonstructure/core/database';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

import {
  createDemoEcommerceComposition,
  runDemoEcommerceMigrations,
  seedDemoEcommerce,
} from '../dist/src/server/index.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const container = await new PostgreSqlContainer('postgres:16-alpine')
  .withDatabase('skeleton')
  .withUsername('skeleton')
  .withPassword('skeleton')
  .start();
const databaseUrl = container.getConnectionUri();

let app;
let database;
try {
  const config = await loadConfig({
    cwd: appRoot,
    envFiles: false,
    environment: { DATABASE_URL: databaseUrl, NODE_ENV: 'test' },
  });
  database = await initializeDatabase(config.database);
  await runDemoEcommerceMigrations(database);
  await seedDemoEcommerce(database, config);

  const composition = await createDemoEcommerceComposition({ appConfig: config, database });
  app = await createServer({
    appConfig: config,
    database,
    activationReport: composition.activationReport,
    routeHandlers: composition.routeHandlers,
    authenticator: composition.authenticator,
    csrfGuard: composition.csrfGuard,
  });
  await app.listen({ host: '127.0.0.1', port: 3000 });
} catch (error) {
  await app?.close().catch(() => undefined);
  await closeDatabase().catch(() => undefined);
  await container.stop().catch(() => undefined);
  throw error;
}

const shutdown = async (signal) => {
  try {
    await app.close();
    await closeDatabase();
  } finally {
    await container.stop();
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  }
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
