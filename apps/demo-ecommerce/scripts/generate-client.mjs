import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const openApiFile = fileURLToPath(new URL('../openapi/demo-openapi.json', import.meta.url));
const target = fileURLToPath(new URL('../src/web/demo-client.generated.ts', import.meta.url));

export async function buildDemoClientTypes() {
  const source = await readFile(openApiFile, 'utf8');
  const document = JSON.parse(source);

  const required = [
    ['get', '/v1/cart'],
    ['put', '/v1/cart/items/{itemId}'],
    ['delete', '/v1/cart/items/{itemId}'],
    ['post', '/v1/cart/checkout'],
  ];

  for (const [method, path] of required) {
    if (document.paths?.[path]?.[method] === undefined) {
      throw new Error(`Demo OpenAPI is missing ${method.toUpperCase()} ${path}.`);
    }
  }

  const digest = createHash('sha256').update(source).digest('hex');
  return `// Generated from openapi/demo-openapi.json. Do not edit.\n// Source SHA-256: ${digest}\n\nexport interface DemoCartLine {\n  readonly itemId: string;\n  readonly slug: string;\n  readonly name: string;\n  readonly sku: string;\n  readonly unitAmount: number;\n  readonly currency: string;\n  readonly quantity: number;\n  readonly lineAmount: number;\n}\n\nexport interface DemoCart {\n  readonly items: readonly DemoCartLine[];\n  readonly itemCount: number;\n  readonly totalAmount: number;\n  readonly currency?: string;\n  readonly lastOrderId?: string;\n}\n\nexport interface DemoOrderSnapshot {\n  readonly id: string;\n  readonly status: string;\n  readonly items: readonly Record<string, unknown>[];\n  readonly totalAmount?: number;\n  readonly currency?: string;\n}\n\nexport interface DemoCheckoutResult {\n  readonly order: DemoOrderSnapshot;\n  readonly cartCleared: boolean;\n}\n\nexport const DEMO_CART_PATHS = {\n  getCart: '/v1/cart',\n  setItem: '/v1/cart/items/{itemId}',\n  removeItem: '/v1/cart/items/{itemId}',\n  checkout: '/v1/cart/checkout',\n} as const;\n`;
}

const invokedDirectly = process.argv[1]?.endsWith('generate-client.mjs');

if (invokedDirectly) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await buildDemoClientTypes(), 'utf8');
  console.log(`Wrote ${target}`);
}
