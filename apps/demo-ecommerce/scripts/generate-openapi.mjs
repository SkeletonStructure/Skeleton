import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializeOpenApiDocument } from '@skeletonstructure/core/api';

import { buildDemoEcommerceOpenApiDocument } from '../dist/src/server/index.js';

const target = fileURLToPath(new URL('../openapi/demo-openapi.json', import.meta.url));
const document = await buildDemoEcommerceOpenApiDocument();

await mkdir(dirname(target), { recursive: true });
await writeFile(target, serializeOpenApiDocument(document), 'utf8');
console.log(`Wrote ${target}`);
