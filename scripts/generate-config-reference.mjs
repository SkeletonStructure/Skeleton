import { mkdir, writeFile } from 'node:fs/promises';

import { renderConfigReference } from '../packages/core/dist/src/config/reference.js';

const outputDirectory = new URL('../docs/config/', import.meta.url);
const outputFile = new URL('./reference.md', outputDirectory);

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, renderConfigReference(), 'utf8');

console.log(`Wrote ${outputFile.pathname}`);
