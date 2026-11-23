import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildGeneratedSdkTypes } from './generate-sdk.mjs';

const target = fileURLToPath(new URL('../packages/sdk/generated/api.ts', import.meta.url));
const expected = await buildGeneratedSdkTypes();
const actual = await readFile(target, 'utf8');

if (actual !== expected) {
  console.error(
    'packages/sdk/generated/api.ts is stale. Run pnpm sdk:generate and commit the result.',
  );
  process.exitCode = 1;
} else {
  console.log('SDK generated types are current.');
}
