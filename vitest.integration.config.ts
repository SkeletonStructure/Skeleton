import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/*/tests/**/*.integration.test.ts',
      'packages/*/tests/**/integration.test.ts',
      'apps/*/tests/**/*.integration.test.ts',
    ],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
