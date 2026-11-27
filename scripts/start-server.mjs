import { pathToFileURL } from 'node:url';

import { createM8Composition, startApplication } from '@skeletonstructure/app-composition';

/** Starts the composed M8 application. Composition failures happen before listen. */
export function startServer() {
  return startApplication({
    cwd: process.cwd(),
    compose: createM8Composition,
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
