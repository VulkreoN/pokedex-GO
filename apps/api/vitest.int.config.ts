import { defineConfig } from 'vitest/config';

/** API integration tests: black-box HTTP against a running API on a fresh database (see scripts/test-all.sh). */
export default defineConfig({
  test: {
    include: ['test/**/*.int.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
