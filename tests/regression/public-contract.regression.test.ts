import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));

interface OpenApiParameter {
  readonly name?: string;
  readonly in?: string;
  readonly required?: boolean;
}

interface OpenApiOperation {
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly content?: Record<
      string,
      { readonly schema?: { readonly required?: readonly string[] } }
    >;
  };
  readonly responses?: Record<string, unknown>;
}

type OpenApiPathItem = Partial<
  Record<'delete' | 'get' | 'patch' | 'post' | 'put', OpenApiOperation>
>;

interface OpenApiDocument {
  readonly info: { readonly version: string };
  readonly paths: Record<string, OpenApiPathItem>;
}

interface OperationSnapshot {
  readonly parameters: readonly { readonly name: string; readonly in: string }[];
  readonly requiredBody: readonly string[];
  readonly responses: readonly string[];
}

type OperationMap = Record<string, Record<string, OperationSnapshot>>;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(root(path), 'utf8')) as T;
}

async function readOpenApi(path: string): Promise<OpenApiDocument> {
  return readJson<OpenApiDocument>(path);
}

function operationSnapshot(document: OpenApiDocument): OperationMap {
  const result: Record<string, Record<string, OperationSnapshot>> = {};

  for (const path of Object.keys(document.paths).sort()) {
    const item = document.paths[path];
    if (item === undefined) continue;

    const operations: Record<string, OperationSnapshot> = {};
    for (const method of ['delete', 'get', 'patch', 'post', 'put'] as const) {
      const operation = item[method];
      if (operation === undefined) continue;

      const parameters = (operation.parameters ?? [])
        .filter((parameter) => parameter.required === true)
        .map((parameter) => ({ name: parameter.name ?? '', in: parameter.in ?? '' }))
        .sort((a, b) => a.in.localeCompare(b.in) || a.name.localeCompare(b.name));
      const requiredBody = [
        ...(operation.requestBody?.content?.['application/json']?.schema?.required ?? []),
      ].sort();

      operations[method] = {
        parameters,
        requiredBody,
        responses: Object.keys(operation.responses ?? {}).sort(),
      };
    }

    if (Object.keys(operations).length > 0) result[path] = operations;
  }

  return result;
}

describe('public API contract regressions', () => {
  it('keeps internal health and config surfaces out of the public OpenAPI', async () => {
    const document = await readOpenApi('openapi/openapi.json');
    const paths = Object.keys(document.paths);

    expect(document.info.version).toBe('0.1.0');
    expect(paths.every((path) => path.startsWith('/v1/'))).toBe(true);
    expect(paths.some((path) => path.includes('/health'))).toBe(false);
    expect(paths.some((path) => path.includes('/config/private'))).toBe(false);
  });

  it('keeps demo-only routes limited to the local cart surface', async () => {
    const [shared, demo] = await Promise.all([
      readOpenApi('openapi/openapi.json'),
      readOpenApi('apps/demo-ecommerce/openapi/demo-openapi.json'),
    ]);
    const sharedPaths = new Set(Object.keys(shared.paths));
    const extra = Object.keys(demo.paths)
      .filter((path) => !sharedPaths.has(path))
      .sort();

    expect(extra).toEqual(['/v1/cart', '/v1/cart/checkout', '/v1/cart/items/{itemId}']);
    expect(extra.some((path) => /pay|admin|guest/i.test(path))).toBe(false);
  });

  it('preserves the v0.1.0 operation compatibility baseline', async () => {
    const [current, baseline, allowlist] = await Promise.all([
      readOpenApi('openapi/openapi.json'),
      readJson<OperationMap>('docs/compatibility/v0.1.0-operations.json'),
      readJson<readonly string[]>('docs/compatibility/v0.1.0-allowlist.json'),
    ]);
    const actual = operationSnapshot(current);
    const differences: string[] = [];

    for (const path of Object.keys(baseline)) {
      const expectedOperations = baseline[path] ?? {};
      const actualOperations = actual[path];
      if (actualOperations === undefined) {
        differences.push(path);
        continue;
      }
      for (const method of Object.keys(expectedOperations)) {
        if (
          JSON.stringify(expectedOperations[method]) !== JSON.stringify(actualOperations[method])
        ) {
          differences.push(`${path}:${method}`);
        }
      }
    }

    const unexpected = differences.filter((key) => !allowlist.includes(key)).sort();
    expect(unexpected).toEqual([]);
  });
});
