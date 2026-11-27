import 'vitest';

// Keys provided by test/helpers/pg-global-setup.ts (integration project) and
// read with `inject()` in test/helpers/pg.ts.
declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URL of the shared Postgres container, admin database (CREATE DATABASE target). */
    pgAdminUrl: string;
    /** Name of the migrated template database each `startPg()` clones with CREATE DATABASE ... TEMPLATE. */
    pgTemplateDb: string;
  }
}
