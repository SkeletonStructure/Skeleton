import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.contract.test.ts', 'packages/sdk/tests/contract.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
