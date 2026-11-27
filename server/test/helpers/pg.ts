import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';
import { createDb, type DbHandle } from '../../src/db/client.js';

/**
 * Integration-test database helper. ONE Postgres + pgvector container is shared
 * by the whole run (test/helpers/pg-global-setup.ts, the `integration` vitest
 * project) and holds a migrated template database. `startPg()` clones that
 * template into a fresh database per call, so each test file stays isolated
 * without its own container.
 *
 * Integration tests gate on `dockerAvailable()` and skip cleanly when Docker is
 * not reachable (CI/sandbox without a Docker daemon).
 */
export interface PgFixture {
  handle: DbHandle;
  url: string;
  stop: () => Promise<void>;
}

let dockerCache: boolean | undefined;

/** Cheap check: can we reach a Docker daemon? */
export async function dockerAvailable(): Promise<boolean> {
  if (dockerCache !== undefined) return dockerCache;
  try {
    const { execSync } = await import('node:child_process');
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    dockerCache = true;
  } catch {
    dockerCache = false;
  }
  return dockerCache;
}

export async function startPg(): Promise<PgFixture> {
  const adminUrl = inject('pgAdminUrl');
  const template = inject('pgTemplateDb');
  if (!adminUrl || !template) {
    throw new Error(
      'startPg(): no shared Postgres (pgAdminUrl is empty). Docker was unavailable in the integration globalSetup; guard the suite with dockerAvailable().',
    );
  }

  const dbName = `t_${randomBytes(8).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${dbName}" TEMPLATE "${template}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const dbUrl = new URL(adminUrl);
  dbUrl.pathname = `/${dbName}`;
  const url = dbUrl.toString();
  const handle = createDb(url, { max: 5 });

  return {
    handle,
    url,
    stop: async () => {
      await handle.close();
      const dropper = postgres(adminUrl, { max: 1 });
      try {
        await dropper.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      } finally {
        await dropper.end({ timeout: 5 });
      }
    },
  };
}
