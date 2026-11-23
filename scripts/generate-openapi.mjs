import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializeOpenApiDocument } from '@skeletonstructure/core/api';
import { buildCommittedOpenApiDocument } from './openapi-source.mjs';

const target = fileURLToPath(new URL('../openapi/openapi.json', import.meta.url));
const document = await buildCommittedOpenApiDocument();

await mkdir(dirname(target), { recursive: true });
await writeFile(target, serializeOpenApiDocument(document), 'utf8');
console.log(`Wrote ${target}`);
