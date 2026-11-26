import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/*.integration.test.ts',
      '**/integration.test.ts',
      '**/*.contract.test.ts',
      '**/contract.test.ts',
      '**/*.regression.test.ts',
      '**/regression.test.ts',
    ],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
