import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Shared settings for both vitest projects (`unit`, `integration`), which are
// declared in vitest.workspace.ts and extend this file. `include` and
// `globalSetup` are deliberately NOT set here: vitest always initializes the
// root config's globalSetup, even when a run selects no file of that project,
// so anything that starts Docker must live only in the integration project.
export default defineConfig({
  resolve: {
    alias: {
      '@devdigest/shared': path.resolve(__dirname, 'src/vendor/shared'),
      '@devdigest/reviewer-core': path.resolve(__dirname, '../reviewer-core/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Testcontainers integration tests can be slow to spin up Postgres.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
