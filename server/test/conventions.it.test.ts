import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { SCAN_JOB_KIND, SCAN_TIMEOUT_MS } from '../src/modules/conventions/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const ROUTE = "export async function routes(app) {\n  app.get('/x', async (req) => service.list(req));\n}\n";
const SERVICE = "import { repo } from './repository.js';\n\nexport class Service {\n  list() {\n    return repo.all();\n  }\n}\n";
const FILES = { 'src/routes.ts': ROUTE, 'src/service.ts': SERVICE };
const SAMPLES = ['src/routes.ts', 'src/service.ts', 'src/missing.ts'];

const SELECTION = { paths: ['src/routes.ts', 'src/service.ts', 'not/offered.ts'] };
const EXTRACTION = {
  conventions: [
    {
      rule: 'Relative imports carry the .js suffix',
      evidence_path: 'src/service.ts',
      evidence_snippet: "import { repo } from './repository.js';",
      confidence: 0.9,
    },
    {
      rule: 'Route handlers delegate to one service call',
      evidence_path: 'src/routes.ts',
      evidence_snippet: "app.get('/x',   async (req) => service.list(req));",
      confidence: 0.8,
    },
    { rule: 'Invented', evidence_path: 'src/service.ts', evidence_snippet: 'class Nope {}', confidence: 0.9 },
    { rule: 'Foreign', evidence_path: 'src/other.ts', evidence_snippet: 'export', confidence: 0.9 },
  ],
};

class FailingLLM extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    // 503 is retryable by default (`withRetry`), so a retrying runner would call twice+.
    throw Object.assign(new Error('provider exploded'), { status: 503 });
  }
}

d('conventions API', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRepo(): Promise<string> {
    n += 1;
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'conv', name: `repo-${n}`, fullName: `conv/repo-${n}` })
      .returning({ id: t.repos.id });
    return row!.id;
  }

  function makeApp(llm: MockLLMProvider = new MockLLMProvider('openai', {
    structuredBySchema: { ConventionFileSelection: SELECTION, ConventionExtraction: EXTRACTION },
  })) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const repoIntel = { getConventionSamples: async () => SAMPLES } as unknown as RepoIntel;
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel,
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function scan(app: App, repoId: string) {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(res.statusCode).toBe(202);
    await app.container.jobs.onIdle();
    return (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
  }

  it('scans: two LLM steps, only grounded candidates land as pending', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionFileSelection: SELECTION, ConventionExtraction: EXTRACTION },
    });
    const app = await makeApp(llm);
    const repoId = await newRepo();
    const body = await scan(app, repoId);

    expect(body.scan).toMatchObject({ status: 'done', error: null });
    expect(body.items.map((c: { rule: string }) => c.rule).sort()).toEqual([
      'Relative imports carry the .js suffix',
      'Route handlers delegate to one service call',
    ]);
    expect(body.items[0]).toMatchObject({ status: 'pending', skill_id: null, confidence: 0.9 });
    expect(body.stats).toEqual({ accepted: 0, rejected: 0, in_skills: 0 });
    const schemas = llm.calls.map((c) => (c.req as { schemaName: string }).schemaName);
    expect(schemas).toEqual(['ConventionFileSelection', 'ConventionExtraction']);
    await app.close();
  });

  it('re-scan keeps accepted/rejected, replaces pending and tells the model what is known', async () => {
    const repoId = await newRepo();
    const first = await scan(await makeApp(), repoId);
    const app = await makeApp();
    const [a, b] = first.items;
    await app.inject({ method: 'PATCH', url: `/conventions/${a.id}`, payload: { status: 'accepted', rule: 'Edited rule' } });
    await app.inject({ method: 'PATCH', url: `/conventions/${b.id}`, payload: { status: 'rejected' } });
    await app.close();

    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionFileSelection: SELECTION, ConventionExtraction: EXTRACTION },
    });
    const app2 = await makeApp(llm);
    const second = await scan(app2, repoId);
    const extraction = llm.calls.find((c) => (c.req as { schemaName: string }).schemaName === 'ConventionExtraction');
    const prompt = (extraction!.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(prompt).toContain('- [accepted] Edited rule');
    expect(prompt).toContain(`- [rejected] ${b.rule}`);

    const byStatus = (s: string) => second.items.filter((c: { status: string }) => c.status === s);
    expect(byStatus('accepted').map((c: { rule: string }) => c.rule)).toEqual(['Edited rule']);
    expect(byStatus('rejected')).toHaveLength(1);
    // `a`'s original text is new again (the model re-proposed it); `b`'s exact text is known → dropped.
    expect(byStatus('pending').map((c: { rule: string }) => c.rule)).toEqual([a.rule]);
    expect(second.stats).toEqual({ accepted: 1, rejected: 1, in_skills: 0 });
    await app2.close();
  });

  it('409 while a scan is active; a left-behind job reads as interrupted and allows a new scan', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const [job] = await pg.handle.db
      .insert(t.jobs)
      .values({ workspaceId, kind: SCAN_JOB_KIND, payload: { workspaceId, repoId }, status: 'running', startedAt: new Date() })
      .returning();
    const busy = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(busy.statusCode).toBe(409);

    const old = new Date(Date.now() - SCAN_TIMEOUT_MS * 3);
    await pg.handle.db.update(t.jobs).set({ startedAt: old, scheduledAt: old }).where(eq(t.jobs.id, job!.id));
    const state = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(state.scan).toMatchObject({ status: 'failed', error: 'interrupted' });
    const body = await scan(app, repoId);
    expect(body.scan.status).toBe('done');
    await app.close();
  });

  it('a failing model is called once (no retries) and the scan reports the error', async () => {
    const llm = new FailingLLM('openai');
    const app = await makeApp(llm);
    const repoId = await newRepo();
    const body = await scan(app, repoId);
    expect(llm.calls).toHaveLength(1);
    expect(body.scan).toMatchObject({ status: 'failed', error: 'provider exploded' });
    expect(body.items).toEqual([]);
    await app.close();
  });

  it('PATCH validates input, 404s unknown ids', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const { items } = await scan(app, repoId);
    const empty = await app.inject({ method: 'PATCH', url: `/conventions/${items[0].id}`, payload: {} });
    expect(empty.statusCode).toBe(422);
    const missing = await app.inject({
      method: 'PATCH',
      url: '/conventions/00000000-0000-0000-0000-000000000000',
      payload: { status: 'accepted' },
    });
    expect(missing.statusCode).toBe(404);
    const repoMissing = await app.inject({ method: 'GET', url: '/repos/00000000-0000-0000-0000-000000000000/conventions' });
    expect(repoMissing.statusCode).toBe(404);
    await app.close();
  });

  it('skill from conventions: extracted + trusted + evidence_files; attach is idempotent; deleting the skill frees them', async () => {
    const app = await makeApp();
    const repoId = await newRepo();
    const { items } = await scan(app, repoId);
    const ids = items.map((c: { id: string }) => c.id);
    for (const id of ids) {
      await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'accepted' } });
    }

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `conv-skill-${repoId.slice(0, 8)}`,
        type: 'convention',
        source: 'extracted',
        body: '- rule',
        evidence_files: ['src/routes.ts', 'src/service.ts'],
      },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      type: 'convention',
      source: 'extracted',
      trusted: true,
      evidence_files: ['src/routes.ts', 'src/service.ts'],
    });

    const attach = (payload: unknown) =>
      app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/attach`, payload });
    expect((await attach({ skill_id: skill.id, ids })).json()).toEqual({ attached: 2 });
    expect((await attach({ skill_id: skill.id, ids })).json()).toEqual({ attached: 0 });
    expect((await attach({ skill_id: '00000000-0000-0000-0000-000000000000', ids })).statusCode).toBe(404);

    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(after.stats).toEqual({ accepted: 2, rejected: 0, in_skills: 2 });
    const locked = await app.inject({ method: 'PATCH', url: `/conventions/${ids[0]}`, payload: { rule: 'x' } });
    expect(locked.statusCode).toBe(409);

    await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    const freed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(freed.stats.in_skills).toBe(0);
    expect(freed.items.every((c: { skill_id: string | null }) => c.skill_id === null)).toBe(true);
    await app.close();
  });
});
