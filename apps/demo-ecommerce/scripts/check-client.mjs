import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildDemoClientTypes } from './generate-client.mjs';

const target = fileURLToPath(new URL('../src/web/demo-client.generated.ts', import.meta.url));
const expected = await buildDemoClientTypes();
const actual = await readFile(target, 'utf8');

if (actual !== expected) {
  console.error(
    'apps/demo-ecommerce/src/web/demo-client.generated.ts is stale. Run pnpm --filter @skeletonstructure/demo-ecommerce client:generate and commit the result.',
  );
  process.exitCode = 1;
} else {
  console.log('E-commerce demo client types are current.');
}
