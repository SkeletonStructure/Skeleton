import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/*/tests/**/*.test.ts',
      'apps/*/tests/**/*.integration.test.ts',
      'tests/regression/**/*.regression.test.ts',
    ],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
