import { pathToFileURL } from 'node:url';

import { startApplication } from '@skeletonstructure/app-composition';

import { basicAppMigrationFolders, createBasicAppComposition } from '../dist/src/server.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** Starts the starter application with an opt-in migration readiness check. */
export function startServer() {
  return startApplication({
    cwd: appRoot,
    compose: createBasicAppComposition,
    migrationFolders: basicAppMigrationFolders,
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  try {
    await startServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Application startup failed.');
    process.exitCode = 1;
  }
}
