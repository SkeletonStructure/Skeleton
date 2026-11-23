import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { serializeOpenApiDocument } from '@skeletonstructure/core/api';

import { buildDemoEcommerceOpenApiDocument } from '../dist/src/server/index.js';

const target = fileURLToPath(new URL('../openapi/demo-openapi.json', import.meta.url));
const expected = serializeOpenApiDocument(await buildDemoEcommerceOpenApiDocument());
const actual = await readFile(target, 'utf8');

if (actual !== expected) {
  console.error(
    'apps/demo-ecommerce/openapi/demo-openapi.json is stale. Run pnpm --filter @skeletonstructure/demo-ecommerce openapi:generate and commit the result.',
  );
  process.exitCode = 1;
} else {
  console.log('E-commerce demo OpenAPI artifact is current.');
}
