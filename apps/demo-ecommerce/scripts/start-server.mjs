import { fileURLToPath } from 'node:url';

import { startApplication } from '@skeletonstructure/app-composition';

import { createDemoEcommerceComposition } from '../dist/src/server/index.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** Starts the demo API. Composition failures happen before `listen()`. */
export function startServer() {
  return startApplication({
    cwd: appRoot,
    compose: createDemoEcommerceComposition,
  });
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
