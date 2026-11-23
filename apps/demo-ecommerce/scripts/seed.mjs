import { fileURLToPath } from 'node:url';

import { loadConfig } from '@skeletonstructure/core/config';
import { closeDatabase, getDatabase, initializeDatabase } from '@skeletonstructure/core/database';

import { seedDemoEcommerce } from '../dist/src/server/index.js';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const config = await loadConfig({ cwd: appRoot });

try {
  await initializeDatabase(config.database);
  const result = await seedDemoEcommerce(getDatabase(), config);
  console.log(`Seed complete (user ${result.user}, ${result.products} products).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seeding failed.');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
