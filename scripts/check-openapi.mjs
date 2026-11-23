import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { serializeOpenApiDocument } from '@skeletonstructure/core/api';
import { buildCommittedOpenApiDocument } from './openapi-source.mjs';

const target = fileURLToPath(new URL('../openapi/openapi.json', import.meta.url));
const expected = serializeOpenApiDocument(await buildCommittedOpenApiDocument());
const actual = await readFile(target, 'utf8');

if (actual !== expected) {
  console.error('openapi/openapi.json is stale. Run pnpm openapi:generate and commit the result.');
  process.exitCode = 1;
} else {
  console.log('OpenAPI artifact is current.');
}
