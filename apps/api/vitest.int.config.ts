import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/** api.int.ts must run first: it creates the very first account and checks that it becomes admin. */
class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

/** API integration tests: black-box HTTP against a running API on a fresh database (see scripts/test-all.sh). */
export default defineConfig({
  test: {
    include: ['test/**/*.int.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false, sequencer: ByName },
  },
});
