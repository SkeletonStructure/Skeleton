import { createServer } from './server.js';
import type { ApiServerOptions } from './types.js';

export type OpenApiDocument = Record<string, unknown>;

/** Generates the committed public contract artifact from the real Fastify routes. */
export async function generateOpenApiDocument(options: ApiServerOptions): Promise<OpenApiDocument> {
  const app = await createServer(options);
  try {
    await app.ready();
    return JSON.parse(JSON.stringify(app.swagger({ yaml: false }))) as OpenApiDocument;
  } finally {
    await app.close();
  }
}

export function serializeOpenApiDocument(document: OpenApiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
