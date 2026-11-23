import { generateOpenApiDocument } from '@skeletonstructure/core/api';
import { defineConfig, env, loadConfig } from '@skeletonstructure/core/config';

/**
 * The committed artifact describes the public M5 contract only. It does not need
 * a database connection; the URL below is a non-secret placeholder used to
 * satisfy the M2 schema.
 */
export async function buildCommittedOpenApiDocument() {
  const appConfig = await loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: 'postgres://placeholder:placeholder@localhost:5432/placeholder' },
    config: () =>
      defineConfig({
        app: { name: 'SkeletonStructure' },
        database: { url: env('DATABASE_URL') },
      }),
  });

  return generateOpenApiDocument({ appConfig });
}
