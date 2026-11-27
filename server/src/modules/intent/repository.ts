import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrIntentRow, PullRow, RepoRow } from '../../db/rows.js';

export type { PrIntentRow, PullRow, RepoRow };

export type PrCommitRow = typeof t.prCommits.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;

/** A `pr_intent` row to write; `updatedAt` is set by the repository. */
export type NewPrIntent = Omit<PrIntentRow, 'updatedAt'>;

/** Data access for `pr_intent` and the intent classifier's `agent_runs` rows. The only Drizzle in the module. */
export class IntentRepository {
  constructor(private readonly db: Db) {}

  /** The PR, when it belongs to the workspace. */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getPrCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db
      .select()
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(asc(t.prCommits.committedAt));
  }

  async getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  /** The stored intent with the cost of the run that produced it (null when none / user-written). */
  async getIntent(prId: string): Promise<{ row: PrIntentRow; costUsd: number | null } | undefined> {
    const [found] = await this.db
      .select({ row: t.prIntent, costUsd: t.agentRuns.costUsd })
      .from(t.prIntent)
      .leftJoin(t.agentRuns, eq(t.agentRuns.id, t.prIntent.runId))
      .where(eq(t.prIntent.prId, prId));
    return found && { row: found.row, costUsd: found.costUsd ?? null };
  }

  async upsertIntent(values: NewPrIntent): Promise<PrIntentRow> {
    const { prId: _prId, ...set } = values;
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ ...values, updatedAt: new Date() })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: { ...set, updatedAt: new Date() } })
      .returning();
    return row!;
  }

  /** An `agent_runs` row (kind='intent', no agent) in `running` state; returns its id. */
  async createIntentRun(values: {
    workspaceId: string;
    prId: string;
    provider: string;
    model: string;
  }): Promise<string> {
    const [row] = await this.db
      .insert(t.agentRuns)
      .values({
        workspaceId: values.workspaceId,
        agentId: null,
        prId: values.prId,
        provider: values.provider,
        model: values.model,
        kind: 'intent',
        status: 'running',
        source: 'local',
      })
      .returning({ id: t.agentRuns.id });
    return row!.id;
  }

  async completeIntentRun(
    runId: string,
    values: {
      status: 'done' | 'failed';
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;
      error?: string | null;
    },
  ): Promise<void> {
    await this.db
      .update(t.agentRuns)
      .set({
        status: values.status,
        durationMs: values.durationMs,
        tokensIn: values.tokensIn,
        tokensOut: values.tokensOut,
        costUsd: values.costUsd,
        findingsCount: 0,
        grounding: 'n/a',
        error: values.error ?? null,
      })
      .where(eq(t.agentRuns.id, runId));
  }
}
