import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockRemoteFetcher } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/** Skills CRUD, versioning, tags, agent links and workspace scoping. */
d('skills API', () => {
  let pg: PgFixture;
  let n = 0;
  const SKILL_MD = '---\nname: imported-rule\ndescription: From the web\ntags: [web]\n---\n# Imported\nDo X.\n';
  const fetcher = new MockRemoteFetcher({
    'https://raw.githubusercontent.com/o/r/main/SKILL.md': { body: SKILL_MD },
  });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), fetcher },
    });
  }

  const body = () => ({
    name: `rubric-${++n}`,
    description: 'Evaluate PR quality',
    type: 'rubric',
    body: '# Rubric\n- correctness',
    tags: ['Quality', ' quality ', 'PR'],
  });

  type App = Awaited<ReturnType<typeof makeApp>>;
  async function createSkill(app: App, payload: Record<string, unknown> = body()) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it('creates a manual, trusted v1 skill with normalized tags', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);
    expect(skill).toMatchObject({
      source: 'manual',
      trusted: true,
      enabled: true,
      version: 1,
      tags: ['quality', 'pr'],
      agent_count: 0,
    });
    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, name: skill.name, tags: ['quality', 'pr'] });
    await app.close();
  });

  it('rejects a non-kebab name (422) and a duplicate name (409)', async () => {
    const app = await makeApp();
    const bad = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...body(), name: 'Not Kebab' },
    });
    expect(bad.statusCode).toBe(422);

    const first = await createSkill(app);
    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...body(), name: first.name },
    });
    expect(dup.statusCode).toBe(409);

    const other = await createSkill(app);
    const rename = await app.inject({
      method: 'PUT',
      url: `/skills/${other.id}`,
      payload: { name: first.name },
    });
    expect(rename.statusCode).toBe(409);
    await app.close();
  });

  it('a config edit bumps the version and snapshots it; toggling enabled does not', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);

    const off = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { enabled: false },
    });
    expect(off.json()).toMatchObject({ enabled: false, version: 1 });

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# v2', trusted: false, tags: ['New'] },
    });
    expect(edited.json()).toMatchObject({ version: 2, trusted: false, tags: ['new'] });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const v1 = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/1` })).json();
    expect(v1).toMatchObject({ body: '# Rubric\n- correctness', trusted: true });
    await app.close();
  });

  it('activates an older version without recording a new one; the next edit is max+1', async () => {
    const app = await makeApp();
    const skill = await createSkill(app);
    const put = (payload: Record<string, unknown>) =>
      app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload });
    expect((await put({ body: '# v2' })).json().version).toBe(2);
    expect((await put({ body: '# v3', trusted: false })).json().version).toBe(3);

    const act = await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/1/activate` });
    expect(act.statusCode).toBe(200);
    expect(act.json()).toMatchObject({ version: 1, body: '# Rubric\n- correctness', trusted: true });
    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);

    // Linked agents read the skill row → they get the active content.
    const got = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(got).toMatchObject({ version: 1, body: '# Rubric\n- correctness' });

    expect((await put({ body: '# v4' })).json().version).toBe(4);

    const missing = await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/99/activate` });
    expect(missing.statusCode).toBe(404);
  });

  it('refuses to activate a version whose name another skill now uses (409)', async () => {
    const app = await makeApp();
    const a = await createSkill(app);
    await app.inject({ method: 'PUT', url: `/skills/${a.id}`, payload: { name: `${a.name}-renamed` } });
    await createSkill(app, { ...body(), name: a.name });
    const res = await app.inject({ method: 'POST', url: `/skills/${a.id}/versions/1/activate` });
    expect(res.statusCode).toBe(409);
  });

  it('previews a URL import without saving, then creates it untrusted + enabled', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { kind: 'url', url: 'https://github.com/o/r/blob/main/SKILL.md' },
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(fetcher.requested.at(-1)).toBe('https://raw.githubusercontent.com/o/r/main/SKILL.md');
    expect(preview).toMatchObject({
      draft: { name: 'imported-rule', type: 'custom', tags: ['web'], source: 'imported_url' },
      ignored_files: [],
      name_taken: false,
    });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const created = await createSkill(app, preview.draft);
    expect(created).toMatchObject({ source: 'imported_url', trusted: false, enabled: true });
  });

  it('previews an uploaded file and reports frontmatter errors as 422', async () => {
    const app = await makeApp();
    const file = (name: string, text: string) => ({
      kind: 'file',
      filename: name,
      content_base64: Buffer.from(text).toString('base64'),
    });
    const ok = await app.inject({ method: 'POST', url: '/skills/import/preview', payload: file('rule.md', SKILL_MD) });
    expect(ok.json().draft.source).toBe('imported_file');
    expect(ok.json().name_taken).toBe(true); // created by the URL-import test above

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: file('rule.md', '---\nname: x\n---\nbody'),
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.message).toMatch(/"description"/);

    const exe = await app.inject({ method: 'POST', url: '/skills/import/preview', payload: file('run.sh', 'x') });
    expect(exe.statusCode).toBe(422);
  });

  it('lists distinct tags', async () => {
    const app = await makeApp();
    await createSkill(app, { ...body(), tags: ['zeta', 'alpha'] });
    const tags = (await app.inject({ method: 'GET', url: '/skills/tags' })).json();
    expect(tags).toEqual(expect.arrayContaining(['alpha', 'zeta', 'quality']));
    expect(tags).toEqual([...tags].sort());
    await app.close();
  });

  it('links skills to an agent, counts both sides, and cascades on delete', async () => {
    const app = await makeApp();
    const a = await createSkill(app, { ...body(), name: `zz-${++n}` });
    const b = await createSkill(app, { ...body(), name: `aa-${++n}` });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
      })
    ).json();

    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [a.id, b.id] },
    });
    expect(linked.statusCode).toBe(200);
    // Prompt order is by name: "aa-…" before "zz-…", regardless of request order.
    expect(linked.json().map((l: { skill_id: string }) => l.skill_id)).toEqual([b.id, a.id]);

    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().skill_count).toBe(2);
    const listed = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(listed.find((x: { id: string }) => x.id === agent.id).skill_count).toBe(2);
    expect((await app.inject({ method: 'GET', url: `/skills/${a.id}` })).json().agent_count).toBe(1);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${a.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${a.id}` })).statusCode).toBe(404);
    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(after.map((l: { skill_id: string }) => l.skill_id)).toEqual([b.id]);
    await app.close();
  });

  it('is workspace-scoped: foreign skills are 404 and cannot be linked', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const foreign = await new SkillsRepository(db).insert({
      workspaceId: otherWs!.id,
      name: 'foreign',
      description: '',
      type: 'custom',
      source: 'manual',
      body: 'x',
      tags: [],
      trusted: true,
      enabled: true,
    });

    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreign.id}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreign.id}`, payload: { body: 'y' } }))
        .statusCode,
    ).toBe(404);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Scoped', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
      })
    ).json();
    const link = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [foreign.id] },
    });
    expect(link.statusCode).toBe(422);
    await app.close();
  });
});
