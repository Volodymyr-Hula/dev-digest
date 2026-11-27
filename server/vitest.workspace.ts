import { configDefaults, defineWorkspace } from 'vitest/config';

// Two projects, both inheriting aliases/globals/environment/timeouts from
// vitest.config.ts.
//
// - unit: everything except `*.it.test.ts`; hermetic, never needs Docker.
// - integration: `*.it.test.ts`; its globalSetup starts ONE shared Postgres
//   container per run. Vitest runs a project's globalSetup only when the run
//   selected at least one file of that project (so the unit-only commands in
//   CI never reach Docker). The setup file provides `pgAdminUrl` and
//   `pgTemplateDb` (see vitest.d.ts) for test/helpers/pg.ts.
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
      exclude: [...configDefaults.exclude, '**/*.it.test.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['test/**/*.it.test.ts'],
      globalSetup: ['./test/helpers/pg-global-setup.ts'],
    },
  },
]);
