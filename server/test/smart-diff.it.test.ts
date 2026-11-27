/**
 * Smart diff — GET /pulls/:id/smart-diff on real Postgres (spec: specs/smart-diff.md
 * SC-004, T-005; FR-002, FR-003, FR-008, FR-009, FR-010, FR-012, FR-013).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { SmartDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const ROLES = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

d('smart diff (Testcontainers pg)', () => {
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

  function appWith(llm = new MockLLMProvider('openai')) {
    return buildApp({
      config: config(),
      db: db(),
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient({ pulls: [] }),
        llm: { openai: llm, openrouter: llm },
      },
    });
  }

  /** A PR with a lock file, a test file and two source files. */
  async function setupPr(ws = workspaceId) {
    const name = `smart-diff-${seq++}`;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 1,
        title: 'Smart diff fixture',
        author: 'marisa.koch',
        branch: 'feat/sd',
        base: 'main',
        headSha: 'cafebabe',
        additions: 0,
        deletions: 0,
        filesCount: 4,
        status: 'needs_review',
      })
      .returning();
    await db()
      .insert(t.prFiles)
      .values([
        { prId: pr!.id, path: 'src/app.ts', additions: 10, deletions: 2, patch: null },
        { prId: pr!.id, path: 'src/app.test.ts', additions: 5, deletions: 0, patch: null },
        { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 40, deletions: 30, patch: null },
        { prId: pr!.id, path: 'src/other.ts', additions: 1, deletions: 1, patch: null },
      ]);
    return pr!;
  }

  async function addReview(prId: string, agentId: string | null, createdAt: string, lines: number[], file = 'src/app.ts') {
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 50, model: 'm', createdAt: new Date(createdAt) })
      .returning();
    if (lines.length > 0) {
      await db()
        .insert(t.findings)
        .values(
          lines.map((line) => ({
            reviewId: review!.id,
            file,
            startLine: line,
            endLine: line,
            severity: 'WARNING',
            category: 'bug',
            title: `finding at ${line}`,
            rationale: 'because',
            confidence: 0.9,
          })),
        );
    }
    return review!;
  }

  const get = async (app: Awaited<ReturnType<typeof appWith>>, prId: string) => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    return { res, body: res.json() };
  };
  const fileOf = (body: SmartDiff, path: string) => body.groups.flatMap((g) => g.files).find((f) => f.path === path);

  it('a PR with no review → 200, a valid SmartDiff, 5 groups in order, every finding_lines [] (FR-002, FR-003, FR-009)', async () => {
    const app = await appWith();
    const pr = await setupPr();

    const { res, body } = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(SmartDiff.safeParse(body).success).toBe(true);
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual(ROLES);

    const byRole = Object.fromEntries(
      (body as SmartDiff).groups.map((g) => [g.role, g.files.map((f) => f.path).sort()]),
    );
    expect(byRole).toEqual({
      core: ['src/app.ts', 'src/other.ts'],
      tests: ['src/app.test.ts'],
      wiring: [],
      docs: [],
      boilerplate: ['pnpm-lock.yaml'],
    });
    expect((body as SmartDiff).groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    // 12 + 5 + 70 + 2
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 89, proposed_splits: [] });
    await app.close();
  });

  it('only the latest review per agent counts: an older line 3 is replaced by the newer line 7; other agents and the agentless bucket are kept (FR-008)', async () => {
    const app = await appWith();
    const pr = await setupPr();
    const [agentA] = await db()
      .insert(t.agents)
      .values({ workspaceId, name: `sd-a-${seq++}`, provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const [agentB] = await db()
      .insert(t.agents)
      .values({ workspaceId, name: `sd-b-${seq++}`, provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();

    await addReview(pr.id, agentA!.id, '2026-11-20T10:00:00Z', [3]);
    await addReview(pr.id, agentA!.id, '2026-11-21T10:00:00Z', [7]);
    await addReview(pr.id, agentB!.id, '2026-11-19T10:00:00Z', [12, 7]);
    await addReview(pr.id, null, '2026-11-18T10:00:00Z', [20], 'src/other.ts');

    const { res, body } = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(fileOf(body, 'src/app.ts')!.finding_lines).toEqual([7, 12]);
    expect(fileOf(body, 'src/other.ts')!.finding_lines).toEqual([20]);
    expect(fileOf(body, 'src/app.test.ts')!.finding_lines).toEqual([]);
    await app.close();
  });

  it('a dismissed finding still contributes its line (FR-008)', async () => {
    const app = await appWith();
    const pr = await setupPr();
    const review = await addReview(pr.id, null, '2026-11-20T10:00:00Z', [9]);
    await db().update(t.findings).set({ dismissedAt: new Date() }).where(eq(t.findings.reviewId, review.id));

    const { body } = await get(app, pr.id);
    expect(fileOf(body, 'src/app.ts')!.finding_lines).toEqual([9]);
    await app.close();
  });

  it('an unknown PR id → 404 not_found envelope; a PR of another workspace → 404; a non-uuid → 422 validation_error (FR-012)', async () => {
    const app = await appWith();

    const unknown = await get(app, '00000000-0000-4000-8000-000000000000');
    expect(unknown.res.statusCode).toBe(404);
    expect(unknown.body.error.code).toBe('not_found');

    const [other] = await db().insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const foreign = await setupPr(other!.id);
    expect((await get(app, foreign.id)).res.statusCode).toBe(404);

    const bad = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    // IdParams rejects it before the handler; the platform envelope maps that to 422 (specs/api-error-envelope.md EE-8)
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('a response that violates the SmartDiff contract is a 500 internal_error, never a 200 or a 422 (FR-003)', async () => {
    const app = await appWith();
    const pr = await setupPr();
    // The service reads through the container's reviewRepo; make it return a non-integer count.
    const spy = vi
      .spyOn(app.container.reviewRepo, 'getPrFiles')
      .mockResolvedValue([{ path: 'src/app.ts', additions: 1.5, deletions: 0 }]);

    const { res, body } = await get(app, pr.id);
    expect(res.statusCode).toBe(500);
    expect(body.error.code).toBe('internal_error');
    expect(body.groups).toBeUndefined();

    spy.mockRestore();
    expect((await get(app, pr.id)).res.statusCode).toBe(200);
    await app.close();
  });

  it('is read-only and never calls a model: agent_runs count and LLM calls are unchanged (FR-010, SC-004)', async () => {
    const llm = new MockLLMProvider('openai');
    const app = await appWith(llm);
    const pr = await setupPr();
    await addReview(pr.id, null, '2026-11-20T10:00:00Z', [1]);

    const runs = async () => (await db().select({ n: count() }).from(t.agentRuns))[0]!.n;
    const before = await runs();
    expect((await get(app, pr.id)).res.statusCode).toBe(200);
    expect(await runs()).toBe(before);
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('seeded PR #482: all 5 roles are populated, src/config.ts reports line 12 and src/api/users.ts line 45 (FR-013)', async () => {
    const app = await appWith();
    const [seeded] = await db().select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));

    const { res, body } = await get(app, seeded!.id);
    expect(res.statusCode).toBe(200);
    expect(SmartDiff.safeParse(body).success).toBe(true);
    const sd = body as SmartDiff;
    expect(sd.groups.map((g) => g.role)).toEqual(ROLES);
    expect(sd.groups.every((g) => g.files.length > 0)).toBe(true);
    expect(sd.groups[0]!.files.map((f) => f.path)).toContain('src/config.ts');
    expect(fileOf(sd, 'src/config.ts')!.finding_lines).toEqual([12]);
    expect(fileOf(sd, 'src/api/users.ts')!.finding_lines).toEqual([45]);
    expect(fileOf(sd, 'pnpm-lock.yaml')).toBeDefined();

    const [config_] = await db().select().from(t.prFiles).where(eq(t.prFiles.path, 'src/config.ts'));
    const [users] = await db().select().from(t.prFiles).where(eq(t.prFiles.path, 'src/api/users.ts'));
    // The seeded CRITICAL finding is anchored: the config patch renders new line 12 …
    const newLines = (patch: string) => {
      const out: number[] = [];
      let n = 0;
      for (const line of patch.split('\n')) {
        const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
        if (h) { n = Number(h[1]); continue; }
        if (line.startsWith('-')) continue;
        out.push(n++);
      }
      return out;
    };
    expect(newLines(config_!.patch!)).toContain(12);
    // … and the users patch must NOT reach line 45 (that finding is the unanchored one).
    expect(newLines(users!.patch!)).not.toContain(45);
    await app.close();
  });
});
