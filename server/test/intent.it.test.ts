import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { Review, StructuredRequest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * PR intent layer, end to end on real Postgres (spec: specs/intent-layer.md
 * SC-002, SC-003, T-003, T-012; FR-021, FR-025, FR-029..FR-035, FR-042).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

const CLASSIFICATION = {
  intent_class: 'feature',
  summary: 'Add rate limiting to the public API.',
  rationale: 'Title and description say so.',
  in_scope: ['limiter'],
  out_of_scope: ['billing'],
};

const HEAD = 'a1b2c3d4';
const CONFIDENCES = ['high', 'medium', 'low'];

const newLlm = () =>
  new MockLLMProvider('openai', {
    structured: REVIEW_FIXTURE,
    structuredBySchema: { IntentClassification: CLASSIFICATION },
  });
const classifierCalls = (llm: MockLLMProvider) =>
  llm.calls.filter(
    (c) => c.method === 'completeStructured' && (c.req as StructuredRequest<unknown>).schemaName === 'IntentClassification',
  );

d('PR intent (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  /** A PR with a description that closes #471, one commit and one changed file. */
  async function setupPr(over: { body?: string | null; workspace?: string } = {}) {
    const name = `intent-api-${seq++}`;
    const ws = over.workspace ?? workspaceId;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: HEAD,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: over.body === undefined ? 'Add rate limiting to the public API. Closes #471.' : over.body,
      })
      .returning();
    await db().insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    await db().insert(t.prCommits).values({ prId: pr!.id, sha: 'a1b2c3d4', message: 'Add limiter', author: 'marisa.koch' });
    return { repo: repo!, pr: pr! };
  }

  function appWith(llm: MockLLMProvider = newLlm(), opts: { withProviders?: boolean } = {}) {
    return buildApp({
      config: config(),
      db: db(),
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient({ pulls: [] }),
        llm: opts.withProviders === false ? { openai: llm } : { openai: llm, openrouter: llm },
      },
    });
  }

  type App = Awaited<ReturnType<typeof appWith>>;

  async function createAgent(app: App, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json() as { id: string };
  }

  /** Start a review and wait until its `review` run(s) reach a terminal status. */
  async function review(app: App, prId: string, agentId: string, expectedReviews: number) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const start = Date.now();
    for (;;) {
      const rows = await db()
        .select()
        .from(t.agentRuns)
        .where(and(eq(t.agentRuns.prId, prId), eq(t.agentRuns.kind, 'review')));
      const terminal = rows.filter((r) => ['done', 'failed', 'cancelled'].includes(r.status ?? ''));
      if (terminal.length >= expectedReviews) break;
      if (Date.now() - start > 10_000) throw new Error('review run did not finish');
      await new Promise((r) => setTimeout(r, 25));
    }
    return runId;
  }

  const intentRuns = (prId: string) =>
    db()
      .select()
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.prId, prId), eq(t.agentRuns.kind, 'intent')));

  it('default review_intent model is openrouter / deepseek-v4-flash until Settings overrides it (T-003, FR-042)', async () => {
    const app = await appWith();
    expect(await app.container.resolveFeatureModel(workspaceId, 'review_intent')).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    await app.close();
  });

  it('seed: PR #482 ships a model-derived medium intent with a referenced_not_fetched ticket source (the e2e fixture)', async () => {
    const app = await appWith();
    const [seeded] = await db().select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const res = await app.inject({ method: 'GET', url: `/pulls/${seeded!.id}/intent` });
    expect(res.statusCode).toBe(200);
    const intent = res.json().intent;
    expect(intent).toMatchObject({ source: 'model', confidence: 'medium', intent_class: 'feature', stale: false });
    expect(intent.sources).toContainEqual(
      expect.objectContaining({ kind: 'ticket_key', status: 'referenced_not_fetched' }),
    );
    await app.close();
  });

  it('GET → {intent:null}; derive → 200 with a valid confidence; a later review on the same head reuses it (0 extra classifier calls) and the trace carries the intent block (SC-002, FR-021, FR-029, FR-030)', async () => {
    const llm = newLlm();
    const app = await appWith(llm);
    const { pr } = await setupPr();

    const empty = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ intent: null });
    expect(classifierCalls(llm)).toHaveLength(0); // GET never calls the LLM

    const derived = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/derive` });
    expect(derived.statusCode).toBe(200);
    const intent = derived.json().intent;
    expect(CONFIDENCES).toContain(intent.confidence);
    // "Closes #471" is a fetched target issue → high
    expect(intent).toMatchObject({
      pr_id: pr.id,
      intent: CLASSIFICATION.summary,
      intent_class: 'feature',
      source: 'model',
      head_sha: HEAD,
      stale: false,
      confidence: 'high',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      cost_usd: 0.001,
    });
    expect(intent.sources).toContainEqual(
      expect.objectContaining({ kind: 'linked_issue', ref: '#471', role: 'target', status: 'used' }),
    );
    expect(classifierCalls(llm)).toHaveLength(1);

    const stored = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(stored.json().intent).toMatchObject({ intent: CLASSIFICATION.summary, source: 'model' });

    // A review on the same head: cache hit, no further classifier call.
    const agent = await createAgent(app, 'IntentReviewer');
    const runId = await review(app, pr.id, agent.id, 1);
    expect(classifierCalls(llm)).toHaveLength(1);
    expect(await intentRuns(pr.id)).toHaveLength(1);

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.intent).toContain('source="pr-intent"');
    expect(trace.prompt_assembly.intent).toContain('Summary: Add rate limiting to the public API.');
    expect(trace.prompt_assembly.intent).toContain('Confidence: high');
    expect(trace.prompt_assembly.user).toContain('## PR intent');
    expect(trace.prompt_assembly.user.indexOf('## PR description')).toBeLessThan(
      trace.prompt_assembly.user.indexOf('## PR intent'),
    );
    const logMsgs = (trace.log as { msg: string }[]).map((l) => l.msg);
    expect(logMsgs).toContain('Deriving PR intent');
    expect(logMsgs).toContain('Intent: feature (confidence high, cached)');

    // The reviewer's own LLM call received the intent block.
    const reviewCall = llm.calls.find(
      (c) => c.method === 'completeStructured' && (c.req as StructuredRequest<unknown>).schemaName !== 'IntentClassification',
    );
    const reviewUser = (reviewCall!.req as StructuredRequest<unknown>).messages.find((m) => m.role === 'user')!.content;
    expect(reviewUser).toContain('<untrusted source="pr-intent">');

    // A second review still makes no classifier call.
    await review(app, pr.id, agent.id, 2);
    expect(classifierCalls(llm)).toHaveLength(1);

    await app.close();
  });

  it('a review with no stored intent derives it before the agent runs, and a new head sha re-derives (FR-020, FR-021)', async () => {
    const llm = newLlm();
    const app = await appWith(llm);
    const { pr } = await setupPr();
    const agent = await createAgent(app, 'FirstReview');

    const runId = await review(app, pr.id, agent.id, 1);
    expect(classifierCalls(llm)).toHaveLength(1);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect((trace.log as { msg: string }[]).map((l) => l.msg)).toContain(
      'Intent: feature (confidence high, derived)',
    );

    await db().update(t.pullRequests).set({ headSha: 'ffff0000' }).where(eq(t.pullRequests.id, pr.id));
    await review(app, pr.id, agent.id, 2);
    expect(classifierCalls(llm)).toHaveLength(2);
    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json().intent;
    expect(got.head_sha).toBe('ffff0000');
    expect(got.stale).toBe(false);

    await app.close();
  });

  it('"review all" with several agents resolves intent once: 1 classifier call, 1 intent run, and every run logs the intent result (FR-020, FR-035)', async () => {
    const llm = newLlm();
    const app = await appWith(llm);
    const { pr } = await setupPr();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } });
    const runIds = (res.json().runs as { run_id: string }[]).map((r) => r.run_id);
    expect(runIds.length).toBeGreaterThanOrEqual(2);

    const start = Date.now();
    for (;;) {
      const rows = await db()
        .select()
        .from(t.agentRuns)
        .where(and(eq(t.agentRuns.prId, pr.id), eq(t.agentRuns.kind, 'review')));
      if (rows.length >= runIds.length && rows.every((r) => ['done', 'failed', 'cancelled'].includes(r.status ?? ''))) break;
      if (Date.now() - start > 15_000) throw new Error('runs did not finish');
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(classifierCalls(llm)).toHaveLength(1);
    expect(await intentRuns(pr.id)).toHaveLength(1);
    for (const runId of runIds) {
      const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
      expect((trace.log as { msg: string }[]).map((l) => l.msg)).toContain('Deriving PR intent');
      expect(trace.prompt_assembly.intent).toContain('source="pr-intent"');
    }
    await app.close();
  });

  it('records exactly one kind=intent agent_runs row (agent_id null, mock cost) and keeps it out of /runs and /runs/active (SC-003, FR-032, FR-033)', async () => {
    const llm = newLlm();
    const app = await appWith(llm);
    const { pr } = await setupPr();
    const agent = await createAgent(app, 'RunsFilter');

    const derive = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/derive` });
    expect(derive.statusCode).toBe(200);
    const reviewRunId = await review(app, pr.id, agent.id, 1);

    const rows = await intentRuns(pr.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'intent',
      agentId: null,
      status: 'done',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      costUsd: 0.001,
      tokensIn: 100,
      tokensOut: 50,
      findingsCount: 0,
      error: null,
    });
    expect(rows[0]!.durationMs).toBeGreaterThanOrEqual(0);

    // an intent run that is still running must not show up as an active review run either
    await db().insert(t.agentRuns).values({ workspaceId, prId: pr.id, kind: 'intent', status: 'running' });

    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json() as { run_id: string }[];
    expect(runs.map((r) => r.run_id)).toEqual([reviewRunId]);
    const active = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` })).json();
    expect(JSON.stringify(active)).not.toContain(rows[0]!.id);
    expect(Array.isArray(active) ? active : (active.runs ?? [])).toHaveLength(0);

    // existing rows / rows inserted without `kind` are reviews (migration default)
    const [legacy] = await db().insert(t.agentRuns).values({ workspaceId, prId: pr.id, status: 'failed' }).returning();
    expect(legacy!.kind).toBe('review');

    await app.close();
  });

  it('the PR-list cost_usd includes the intent run cost (FR-034)', async () => {
    const app = await appWith();
    const { repo, pr } = await setupPr();
    const agent = await createAgent(app, 'CostAgent');
    await review(app, pr.id, agent.id, 1); // derives intent (0.001) + one review (0.001)

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as {
      id: string;
      cost_usd: number | null;
    }[];
    const row = list.find((p) => p.id === pr.id)!;
    expect(row.cost_usd).toBeCloseTo(0.002, 10);
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs).toHaveLength(1);
    expect(runs[0].cost_usd).toBe(0.001); // the review's own cost excludes intent

    await app.close();
  });

  it('PUT /intent: 422 for an empty or invalid body, 200 saves a user intent (confidence high, current head) (FR-031)', async () => {
    const llm = newLlm();
    const app = await appWith(llm);
    const { pr } = await setupPr();
    const url = `/pulls/${pr.id}/intent`;
    const valid = { intent_class: 'bugfix', intent: 'Fix the limiter off-by-one', in_scope: ['limiter'], out_of_scope: [] };

    for (const bad of [
      { ...valid, intent: '' },
      { ...valid, intent: 'x'.repeat(601) },
      { ...valid, intent_class: 'rewrite' },
      { ...valid, in_scope: Array.from({ length: 9 }, () => 'a') },
      { ...valid, out_of_scope: ['y'.repeat(201)] },
      { intent_class: 'bugfix' },
    ]) {
      const res = await app.inject({ method: 'PUT', url, payload: bad });
      expect(res.statusCode).toBe(422);
    }
    expect((await app.inject({ method: 'GET', url })).json()).toEqual({ intent: null });

    const ok = await app.inject({ method: 'PUT', url, payload: valid });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().intent).toMatchObject({
      pr_id: pr.id,
      intent: 'Fix the limiter off-by-one',
      intent_class: 'bugfix',
      in_scope: ['limiter'],
      out_of_scope: [],
      source: 'user',
      confidence: 'high',
      head_sha: HEAD,
      stale: false,
    });
    // defaults: omitted scope lists become []
    const minimal = await app.inject({ method: 'PUT', url, payload: { intent_class: 'docs', intent: 'Docs' } });
    expect(minimal.json().intent).toMatchObject({ in_scope: [], out_of_scope: [] });
    expect(classifierCalls(llm)).toHaveLength(0);
    await app.close();
  });

  it('a user override survives a new head: reviews reuse it (0 classifier calls) and GET reports stale; derive replaces it (FR-022, FR-023)', async () => {
    const llm = newLlm();
    const app = await appWith(llm);
    const { pr } = await setupPr();
    const agent = await createAgent(app, 'OverrideAgent');

    await app.inject({
      method: 'PUT',
      url: `/pulls/${pr.id}/intent`,
      payload: { intent_class: 'security', intent: 'My own statement of intent', in_scope: [], out_of_scope: [] },
    });
    await db().update(t.pullRequests).set({ headSha: 'beef1234' }).where(eq(t.pullRequests.id, pr.id));

    const stale = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json().intent;
    expect(stale).toMatchObject({ source: 'user', stale: true, head_sha: HEAD });

    const runId = await review(app, pr.id, agent.id, 1);
    expect(classifierCalls(llm)).toHaveLength(0);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.intent).toContain('Summary: My own statement of intent');
    expect(trace.prompt_assembly.intent).toContain('Class: security');
    expect((trace.log as { msg: string }[]).map((l) => l.msg)).toContain('Intent: security (confidence high, user)');
    expect(await intentRuns(pr.id)).toHaveLength(0);

    const rederived = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/derive` });
    expect(rederived.json().intent).toMatchObject({ source: 'model', head_sha: 'beef1234', stale: false });
    expect(classifierCalls(llm)).toHaveLength(1);

    await app.close();
  });

  it('a Settings override of review_intent decides the classifier model', async () => {
    const llm = newLlm();
    const app = await appWith(llm);
    const { pr } = await setupPr();
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } } },
    });
    expect(put.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/derive` });
    expect(res.json().intent).toMatchObject({ provider: 'openrouter', model: 'z-ai/glm-4.7-flash' });
    expect((classifierCalls(llm)[0]!.req as StructuredRequest<unknown>).model).toBe('z-ai/glm-4.7-flash');

    // restore the registry default for the tests that follow
    await app.inject({ method: 'PUT', url: '/settings', payload: { feature_models: {} } });
    await app.close();
  });

  it('no intent LLM available: the review still completes without an intent section; derive surfaces the error envelope (FR-025)', async () => {
    // Only the agent's provider is injected; `openrouter` (the intent default) is not.
    const llm = newLlm();
    const app = await appWith(llm, { withProviders: false });
    const { pr } = await setupPr();
    const agent = await createAgent(app, 'NoIntentLlm');

    const runId = await review(app, pr.id, agent.id, 1);
    const [run] = await db().select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.intent ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## PR intent');
    expect((trace.log as { msg: string }[]).some((l) => l.msg.startsWith('Intent unavailable'))).toBe(true);
    expect(classifierCalls(llm)).toHaveLength(0);
    expect(await intentRuns(pr.id)).toHaveLength(0);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/derive` });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('config_error');
    await app.close();
  });

  it('a failing classifier fails the derive call, completes the intent run as failed, and does not fail the review', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: REVIEW_FIXTURE,
      structuredBySchema: { IntentClassification: { intent_class: 'nonsense' } },
    });
    const app = await appWith(llm);
    const { pr } = await setupPr();
    const agent = await createAgent(app, 'BadClassifier');

    const runId = await review(app, pr.id, agent.id, 1);
    const [run] = await db().select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    const rows = await intentRuns(pr.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'failed', costUsd: null });
    expect(rows[0]!.error).toBeTruthy();
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json()).toEqual({ intent: null });

    await app.close();
  });

  it('404 for an unknown PR or one in another workspace; 422 for a malformed id (workspace scoping)', async () => {
    const app = await appWith();
    const [other] = await db().insert(t.workspaces).values({ name: 'someone else' }).returning();
    const { pr: foreign } = await setupPr({ workspace: other!.id });
    const missing = '00000000-0000-4000-8000-000000000000';
    const body = { intent_class: 'docs', intent: 'x', in_scope: [], out_of_scope: [] };

    for (const id of [missing, foreign.id]) {
      expect((await app.inject({ method: 'GET', url: `/pulls/${id}/intent` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/pulls/${id}/intent/derive` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'PUT', url: `/pulls/${id}/intent`, payload: body })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/intent' })).statusCode).toBe(422);
    expect(await db().select().from(t.prIntent).where(eq(t.prIntent.prId, foreign.id))).toHaveLength(0);

    await app.close();
  });
});
