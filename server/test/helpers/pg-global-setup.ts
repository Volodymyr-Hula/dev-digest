import { execSync } from 'node:child_process';
import postgres from 'postgres';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { GlobalSetupContext } from 'vitest/node';
import { runMigrations } from '../../src/db/migrate.js';

/**
 * Vitest globalSetup of the `integration` project: ONE `pgvector/pgvector:pg16`
 * container per run, shared by every `*.it.test.ts` file.
 *
 * It migrates a template database once; `startPg()` (test/helpers/pg.ts) then
 * clones it per test file with `CREATE DATABASE ... TEMPLATE`, so files keep
 * full isolation without paying a container start + migration each.
 *
 * Without Docker it provides empty strings and returns, so integration files
 * keep self-skipping through `dockerAvailable()`.
 */
const TEMPLATE_DB = 'devdigest_tpl';

function dockerReachable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export default async function setup({ provide }: GlobalSetupContext): Promise<(() => Promise<void>) | void> {
  if (!dockerReachable()) {
    provide('pgAdminUrl', '');
    provide('pgTemplateDb', '');
    return;
  }

  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('devdigest')
    .withUsername('devdigest')
    .withPassword('devdigest')
    .start();

  try {
    const defaultUrl = container.getConnectionUri();
    const adminUrl = new URL(defaultUrl);
    adminUrl.pathname = '/postgres';
    const tplUrl = new URL(defaultUrl);
    tplUrl.pathname = `/${TEMPLATE_DB}`;

    const admin = postgres(adminUrl.toString(), { max: 1 });
    try {
      await admin.unsafe(`CREATE DATABASE "${TEMPLATE_DB}"`);
    } finally {
      await admin.end({ timeout: 5 });
    }

    // runMigrations opens and closes its own connection; nothing stays open on
    // the template, which CREATE DATABASE ... TEMPLATE requires.
    await runMigrations(tplUrl.toString());

    provide('pgAdminUrl', adminUrl.toString());
    provide('pgTemplateDb', TEMPLATE_DB);
  } catch (err) {
    await container.stop();
    throw err;
  }

  return async () => {
    await container.stop();
  };
}
