import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, JobRow } from '../../db/rows.js';
import { SCAN_JOB_KIND } from './constants.js';

export type { ConventionRow, JobRow };

export type ConventionStatusValue = ConventionRow['status'];

export interface NewConvention {
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
}

export interface ConventionPatch {
  rule?: string;
  status?: ConventionStatusValue;
}

/** Data access for `conventions` (+ the scan's `jobs` rows). The only Drizzle in the module. */
export class ConventionsRepository {
  constructor(private readonly db: Db) {}

  /** The repo's clone coordinates, when it belongs to the workspace. */
  async getRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ id: string; owner: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.id, id), eq(t.conventions.workspaceId, workspaceId)));
    return row;
  }

  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.id, id), eq(t.conventions.workspaceId, workspaceId)))
      .returning();
    return row;
  }

  /** Re-scan: drop the repo's `pending` rows and insert the new candidates, atomically. */
  async replacePending(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.repoId, repoId), eq(t.conventions.status, 'pending')));
      if (rows.length === 0) return;
      await tx.insert(t.conventions).values(
        rows.map((r) => ({ ...r, workspaceId, repoId, status: 'pending' as const })),
      );
    });
  }

  /** Accepted + rejected rule texts — the "already known" block of the extraction prompt. */
  async knownRules(repoId: string): Promise<{ rule: string; status: ConventionStatusValue }[]> {
    return this.db
      .select({ rule: t.conventions.rule, status: t.conventions.status })
      .from(t.conventions)
      .where(
        and(eq(t.conventions.repoId, repoId), inArray(t.conventions.status, ['accepted', 'rejected'])),
      )
      .orderBy(t.conventions.createdAt);
  }

  async skillExists(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)));
    return !!row;
  }

  /** Link accepted, not-yet-attached conventions to a skill. Idempotent. */
  async attach(workspaceId: string, repoId: string, skillId: string, ids: string[]): Promise<number> {
    const rows = await this.db
      .update(t.conventions)
      .set({ skillId })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
          eq(t.conventions.status, 'accepted'),
          isNull(t.conventions.skillId),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  /** Latest scan job for the repo (any status). */
  async latestScanJob(workspaceId: string, repoId: string): Promise<JobRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.workspaceId, workspaceId),
          eq(t.jobs.kind, SCAN_JOB_KIND),
          sql`${t.jobs.payload}->>'repoId' = ${repoId}`,
        ),
      )
      .orderBy(desc(t.jobs.scheduledAt))
      .limit(1);
    return row;
  }
}
