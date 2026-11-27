import { describe, it, expect, beforeEach } from 'vitest';
import type { FeatureModelChoice, LLMProvider, StructuredRequest, StructuredResult, UnifiedDiff } from '@devdigest/shared';
import { IntentService } from '../src/modules/intent/service.js';
import type { IntentRepository, PullRow, RepoRow } from '../src/modules/intent/repository.js';
import type { PrIntentRow } from '../src/db/rows.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';

/**
 * IntentService with a fake repository (in-memory), MockLLMProvider
 * (`structuredBySchema.IntentClassification`), MockGitHubClient and MockGitClient.
 * Spec: specs/intent-layer.md FR-001, FR-004, FR-007..FR-009, FR-012, FR-014,
 * FR-020..FR-025, FR-032, FR-035, FR-036, FR-044; SC-006.
 */

const WS = 'ws-1';
const HEAD = 'a1b2c3d4e5f6a7b8';
const CLASSIFICATION = {
  intent_class: 'feature',
  summary: 'Add rate limiting to the public API.',
  rationale: 'Title and description say so.',
  in_scope: ['limiter'],
  out_of_scope: ['billing'],
};
const LONG_BODY =
  'This pull request adds a token bucket rate limiter in front of the public API so that anonymous clients cannot hammer it.';

// ---- fakes -----------------------------------------------------------------

interface RunRow {
  id: string;
  values: Parameters<IntentRepository['createIntentRun']>[0];
  completed?: Parameters<IntentRepository['completeIntentRun']>[1];
}

function makeFakeRepo(init: { pull: PullRow; repo: RepoRow; commits?: string[]; files?: string[] }) {
  const state = {
    pull: init.pull,
    repo: init.repo,
    commits: (init.commits ?? []).map((message) => ({ message })),
    files: (init.files ?? []).map((path) => ({ path, additions: 1, deletions: 0 })),
    intent: undefined as PrIntentRow | undefined,
    runs: [] as RunRow[],
    upserts: [] as PrIntentRow[],
  };
  const repo = {
    getPull: async (workspaceId: string, prId: string) =>
      workspaceId === WS && prId === state.pull.id ? state.pull : undefined,
    getRepo: async () => state.repo,
    getPrCommits: async () => state.commits,
    getPrFiles: async () => state.files,
    getIntent: async () => {
      if (!state.intent) return undefined;
      const run = state.runs.find((r) => r.id === state.intent!.runId);
      return { row: state.intent, costUsd: run?.completed?.costUsd ?? null };
    },
    upsertIntent: async (values: Omit<PrIntentRow, 'updatedAt'>) => {
      const row = { ...values, updatedAt: new Date('2026-01-01T00:00:00Z') } as PrIntentRow;
      state.intent = row;
      state.upserts.push(row);
      return row;
    },
    createIntentRun: async (values: RunRow['values']) => {
      const id = `run-${state.runs.length + 1}`;
      state.runs.push({ id, values });
      return id;
    },
    completeIntentRun: async (id: string, values: NonNullable<RunRow['completed']>) => {
      state.runs.find((r) => r.id === id)!.completed = values;
    },
  };
  return { state, repo: repo as unknown as IntentRepository };
}

const makePull = (over: Partial<PullRow> = {}): PullRow =>
  ({
    id: 'pr-1',
    workspaceId: WS,
    repoId: 'repo-1',
    number: 482,
    title: 'Add rate limiting',
    branch: 'feat/rate-limit',
    headSha: HEAD,
    body: LONG_BODY,
    ...over,
  }) as unknown as PullRow;

const REPO = { id: 'repo-1', owner: 'acme', name: 'api' } as unknown as RepoRow;

const diffOf = (paths: string[]) =>
  ({ files: paths.map((path) => ({ path, additions: 1, deletions: 0 })) }) as unknown as UnifiedDiff;

function makeLog() {
  const events: { kind: 'tool' | 'info' | 'result'; msg: string }[] = [];
  return {
    events,
    log: {
      tool: (msg: string) => events.push({ kind: 'tool', msg }),
      info: (msg: string) => events.push({ kind: 'info', msg }),
      result: (msg: string) => events.push({ kind: 'result', msg }),
    },
  };
}

const classifierCalls = (llm: MockLLMProvider) =>
  llm.calls.filter(
    (c) => c.method === 'completeStructured' && (c.req as StructuredRequest<unknown>).schemaName === 'IntentClassification',
  );
const userPrompt = (call: { req: unknown }) =>
  (call.req as StructuredRequest<unknown>).messages.find((m) => m.role === 'user')!.content;

interface Ctx {
  fake: ReturnType<typeof makeFakeRepo>;
  llm: MockLLMProvider;
  github: MockGitHubClient;
  git: MockGitClient;
  choice: { current: FeatureModelChoice };
  providersAsked: string[];
  service: IntentService;
  logged: { level: string; obj: unknown; msg?: string }[];
}

function setup(
  o: {
    pull?: Partial<PullRow>;
    files?: string[];
    commits?: string[];
    issues?: ConstructorParameters<typeof MockGitHubClient>[0];
    git?: ConstructorParameters<typeof MockGitClient>[0];
    gitClient?: MockGitClient;
    llm?: MockLLMProvider;
    githubDep?: () => Promise<MockGitHubClient>;
    llmDep?: (p: string) => Promise<LLMProvider>;
  } = {},
): Ctx {
  const fake = makeFakeRepo({ pull: makePull(o.pull), repo: REPO, files: o.files, commits: o.commits });
  const llm = o.llm ?? new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: CLASSIFICATION } });
  const github = new MockGitHubClient(o.issues ?? {});
  const git = o.gitClient ?? new MockGitClient(o.git ?? {});
  const choice = { current: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' } as FeatureModelChoice };
  const providersAsked: string[] = [];
  const service = new IntentService({
    repo: fake.repo,
    github: o.githubDep ?? (async () => github),
    git: () => git,
    llm: o.llmDep
      ? async (p) => {
          providersAsked.push(p);
          return o.llmDep!(p);
        }
      : async (p) => {
          providersAsked.push(p);
          return llm;
        },
    resolveModel: async () => choice.current,
  });
  return { fake, llm, github, git, choice, providersAsked, service, logged: [] };
}

const sourceOf = (row: PrIntentRow | undefined, kind: string, ref?: string) =>
  row?.sources.find((s) => s.kind === kind && (ref === undefined || s.ref === ref));

// ---- tests -----------------------------------------------------------------

describe('IntentService.derive (FR-012, FR-014, FR-015, FR-032)', () => {
  it('makes one classifier call on the resolved model, stores the result and an intent run with the call cost', async () => {
    const c = setup({ files: ['src/limiter.ts'], commits: ['Add limiter\n\nlong body'] });
    const dto = await c.service.derive(WS, 'pr-1');

    const calls = classifierCalls(c.llm);
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    expect(req.model).toBe('deepseek/deepseek-v4-flash');
    expect(req.schemaName).toBe('IntentClassification');
    expect(req.maxRetries).toBe(1);
    expect(c.providersAsked).toEqual(['openrouter']);

    // FR-001: title, description, branch, commit subject, changed path all reach the classifier
    const prompt = userPrompt(calls[0]!);
    expect(prompt).toContain('Add rate limiting');
    expect(prompt).toContain('token bucket');
    expect(prompt).toContain('feat/rate-limit');
    expect(prompt).toContain('Add limiter');
    expect(prompt).not.toContain('long body');

    expect(dto).toMatchObject({
      pr_id: 'pr-1',
      intent: CLASSIFICATION.summary,
      intent_class: 'feature',
      source: 'model',
      head_sha: HEAD,
      stale: false,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      cost_usd: 0.001,
      in_scope: ['limiter'],
      out_of_scope: ['billing'],
    });
    // confidence comes from the sources (long description → medium), not from the model
    expect(dto.confidence).toBe('medium');

    expect(c.fake.state.runs).toHaveLength(1);
    expect(c.fake.state.runs[0]!.values).toMatchObject({
      workspaceId: WS,
      prId: 'pr-1',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    expect(c.fake.state.runs[0]!.completed).toMatchObject({
      status: 'done',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    });
    expect(c.fake.state.intent?.runId).toBe('run-1');
  });

  it('confidence is low for a title-only PR and is not influenced by the model output', async () => {
    const c = setup({ pull: { body: null } });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(dto.confidence).toBe('low');
  });

  it('caps an over-long model output before storing it', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        IntentClassification: { ...CLASSIFICATION, summary: 's'.repeat(900), in_scope: Array.from({ length: 12 }, () => 'x') },
      },
    });
    const c = setup({ llm });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(dto.intent).toHaveLength(600);
    expect(dto.in_scope).toHaveLength(8);
  });

  it('bypasses the cache: a second derive on an unchanged PR calls the model again', async () => {
    const c = setup();
    await c.service.derive(WS, 'pr-1');
    await c.service.derive(WS, 'pr-1');
    expect(classifierCalls(c.llm)).toHaveLength(2);
    expect(c.fake.state.runs).toHaveLength(2);
  });

  it('404s for a PR outside the workspace and calls nothing', async () => {
    const c = setup();
    await expect(c.service.derive('other-ws', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(c.service.derive(WS, 'missing')).rejects.toBeInstanceOf(NotFoundError);
    expect(c.llm.calls).toHaveLength(0);
  });
});

describe('IntentService.resolveForReview — cache, override, head change (FR-020..FR-023)', () => {
  let c: Ctx;
  beforeEach(() => {
    c = setup({ files: ['src/limiter.ts'] });
  });
  const review = (pull: PullRow = c.fake.state.pull) => {
    const l = makeLog();
    return c.service.resolveForReview(WS, { ...pull }, REPO, diffOf(['src/limiter.ts']), l.log).then((r) => ({ r, ...l }));
  };

  it('first review derives, a second review on the same head and inputs is a cache hit with 0 extra LLM calls and no new run', async () => {
    const first = await review();
    expect(first.r?.origin).toBe('derived');
    expect(classifierCalls(c.llm)).toHaveLength(1);

    const second = await review();
    expect(second.r?.origin).toBe('cached');
    expect(second.r?.dto.intent).toBe(CLASSIFICATION.summary);
    expect(classifierCalls(c.llm)).toHaveLength(1);
    expect(c.fake.state.runs).toHaveLength(1);
    // the cached DTO still reports the cost of the call that produced it
    expect(second.r?.dto.cost_usd).toBe(0.001);
  });

  it('a new head sha re-derives (1 more call)', async () => {
    await review();
    c.fake.state.pull = makePull({ headSha: 'ffffffff00000000' });
    const again = await review();
    expect(again.r?.origin).toBe('derived');
    expect(classifierCalls(c.llm)).toHaveLength(2);
    expect(c.fake.state.intent?.headSha).toBe('ffffffff00000000');
  });

  it('an edited description or a different Settings model re-derives', async () => {
    await review();
    c.fake.state.pull = makePull({ body: `${LONG_BODY} It also adds a config flag.` });
    await review();
    expect(classifierCalls(c.llm)).toHaveLength(2);

    c.choice.current = { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' };
    await review();
    expect(classifierCalls(c.llm)).toHaveLength(3);
    expect((classifierCalls(c.llm)[2]!.req as StructuredRequest<unknown>).model).toBe('z-ai/glm-4.7-flash');
  });

  it('a user override is used with 0 LLM calls, even after the head moved (and the DTO is stale)', async () => {
    await c.service.update(WS, 'pr-1', {
      intent_class: 'bugfix',
      intent: 'My own words',
      in_scope: ['x'],
      out_of_scope: [],
    });
    c.fake.state.pull = makePull({ headSha: 'ffffffff00000000' });

    const res = await review();
    expect(res.r?.origin).toBe('user');
    expect(res.r?.dto).toMatchObject({ intent: 'My own words', intent_class: 'bugfix', source: 'user', stale: true });
    expect(res.r?.promptText).toContain('Summary: My own words');
    expect(classifierCalls(c.llm)).toHaveLength(0);
    expect(c.fake.state.runs).toHaveLength(0);
    expect(res.events.at(-1)).toEqual({ kind: 'result', msg: 'Intent: bugfix (confidence high, user)' });
  });

  it('emits the run-log events: tool "Deriving PR intent", one info per source, one result line (FR-035)', async () => {
    const res = await review();
    expect(res.events[0]).toEqual({ kind: 'tool', msg: 'Deriving PR intent' });
    const infos = res.events.filter((e) => e.kind === 'info').map((e) => e.msg);
    for (const kind of ['title', 'description', 'branch', 'paths', 'diff_stats']) {
      expect(infos.some((m) => m.startsWith(`Intent source ${kind} `) && m.endsWith(': used'))).toBe(true);
    }
    const results = res.events.filter((e) => e.kind === 'result');
    expect(results).toEqual([{ kind: 'result', msg: 'Intent: feature (confidence medium, derived)' }]);

    const cached = await review();
    expect(cached.events.filter((e) => e.kind === 'result')).toEqual([
      { kind: 'result', msg: 'Intent: feature (confidence medium, cached)' },
    ]);
  });

  it('uses the freshly loaded diff for the changed paths it sends to the classifier (the review path has no pr_files)', async () => {
    const l = makeLog();
    await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf(['src/from-diff.ts']), l.log);
    expect(userPrompt(classifierCalls(c.llm)[0]!)).toContain('src/from-diff.ts');
  });
});

describe('IntentService.update / get (FR-023, FR-029, FR-031)', () => {
  it('get returns null before any intent exists, without calling the LLM', async () => {
    const c = setup();
    expect(await c.service.get(WS, 'pr-1')).toBeNull();
    expect(c.llm.calls).toHaveLength(0);
    await expect(c.service.get(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('update stores a user intent: confidence high, current head, no model/provider', async () => {
    const c = setup();
    const dto = await c.service.update(WS, 'pr-1', {
      intent_class: 'docs',
      intent: 'Docs only',
      in_scope: [],
      out_of_scope: ['code'],
    });
    expect(dto).toMatchObject({
      source: 'user',
      confidence: 'high',
      head_sha: HEAD,
      stale: false,
      intent_class: 'docs',
      intent: 'Docs only',
      provider: null,
      model: null,
      cost_usd: null,
    });
    expect(c.llm.calls).toHaveLength(0);
  });

  it('get flags a user intent stale once the head moved; a model intent is never stale', async () => {
    const c = setup();
    await c.service.update(WS, 'pr-1', { intent_class: 'docs', intent: 'Docs', in_scope: [], out_of_scope: [] });
    expect((await c.service.get(WS, 'pr-1'))?.stale).toBe(false);
    c.fake.state.pull = makePull({ headSha: 'ffffffff00000000' });
    expect((await c.service.get(WS, 'pr-1'))?.stale).toBe(true);

    const m = setup();
    await m.service.derive(WS, 'pr-1');
    m.fake.state.pull = makePull({ headSha: 'ffffffff00000000' });
    expect((await m.service.get(WS, 'pr-1'))?.stale).toBe(false);
  });

  it('derive replaces a user intent with a model one', async () => {
    const c = setup();
    await c.service.update(WS, 'pr-1', { intent_class: 'docs', intent: 'Docs', in_scope: [], out_of_scope: [] });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(dto.source).toBe('model');
    expect(classifierCalls(c.llm)).toHaveLength(1);
  });
});

describe('IntentService — issues (FR-002..FR-004)', () => {
  it('fetches a closing issue as a `target` source; a used target issue gives high confidence and is sent untrusted-wrapped', async () => {
    const c = setup({
      pull: { body: 'Fixes #471', title: 'Fix it', branch: 'fix/x' },
      issues: { issues: { 471: { title: 'Rate limit missing', body: 'ISSUE-BODY-TEXT' } } },
    });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(c.github.issueCalls).toEqual([471]);
    expect(dto.sources).toContainEqual({
      kind: 'linked_issue',
      ref: '#471',
      role: 'target',
      status: 'used',
      chars: 'ISSUE-BODY-TEXT'.length,
    });
    expect(dto.confidence).toBe('high');
    expect(userPrompt(classifierCalls(c.llm)[0]!)).toContain('<untrusted source="issue-471">\nRate limit missing\n\nISSUE-BODY-TEXT\n</untrusted>');
  });

  it('a bare #N is a background issue → medium confidence even with a short description', async () => {
    const c = setup({ pull: { body: 'See #9' } });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'linked_issue', '#9')).toMatchObject({ role: 'background', status: 'used' });
    expect(dto.confidence).toBe('medium');
  });

  it('an issue that is really a pull request is skipped and its body is never sent', async () => {
    const c = setup({
      pull: { body: 'Fixes #12' },
      issues: { issues: { 12: { is_pull_request: true, body: 'PR-BODY-MUST-NOT-LEAK' } } },
    });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'linked_issue', '#12')).toMatchObject({
      role: 'target',
      status: 'skipped_pull_request',
    });
    expect(userPrompt(classifierCalls(c.llm)[0]!)).not.toContain('PR-BODY-MUST-NOT-LEAK');
    expect(dto.confidence).toBe('low'); // a skipped PR is not a used target issue, and the body is short
  });

  it('a 404 issue is recorded `not_found` and the derivation still succeeds', async () => {
    const c = setup({ pull: { body: 'Fixes #404' }, issues: { issues: { 404: null } } });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'linked_issue', '#404')).toMatchObject({ status: 'not_found' });
    expect(dto.confidence).toBe('low');
    expect(classifierCalls(c.llm)).toHaveLength(1);
  });

  it('a truncated target issue (body > 3000 chars) is capped, flagged truncated and still gives high confidence', async () => {
    const c = setup({
      pull: { body: 'Closes #3' },
      issues: { issues: { 3: { body: 'z'.repeat(5000) } } },
    });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'linked_issue', '#3')).toMatchObject({ status: 'truncated', chars: 3000 });
    expect(userPrompt(classifierCalls(c.llm)[0]!)).not.toContain('z'.repeat(3001));
    expect(dto.confidence).toBe('high');
  });

  it('fetches at most 3 issues; the rest are referenced_not_fetched with reason `limit`', async () => {
    const c = setup({ pull: { body: 'Fixes #1 #2 and also fixes #3, closes #4, see #5' } });
    await c.service.derive(WS, 'pr-1');
    expect(c.github.issueCalls).toEqual([1, 2, 3]);
    expect(sourceOf(c.fake.state.intent, 'linked_issue', '#4')).toMatchObject({
      status: 'referenced_not_fetched',
      reason: 'limit',
    });
    expect(sourceOf(c.fake.state.intent, 'linked_issue', '#5')).toMatchObject({ reason: 'limit' });
  });

  it('without a GitHub token the issue is referenced_not_fetched (no_github_token) and derivation proceeds', async () => {
    const c = setup({
      pull: { body: 'Fixes #8' },
      githubDep: async () => {
        throw new ConfigError('GITHUB_TOKEN is not configured');
      },
    });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'linked_issue', '#8')).toMatchObject({
      status: 'referenced_not_fetched',
      reason: 'no_github_token',
    });
    expect(dto.confidence).toBe('low');
  });

  it('a PR without issue references makes no GitHub call at all', async () => {
    const c = setup({ pull: { body: 'Just a change' } });
    await c.service.derive(WS, 'pr-1');
    expect(c.github.issueCalls).toEqual([]);
  });

  it('records a Jira key as referenced_not_fetched and never fetches it', async () => {
    const c = setup({ pull: { title: 'ABC-12 add limiter', body: '' } });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'ticket_key', 'ABC-12')).toMatchObject({ status: 'referenced_not_fetched' });
    expect(c.github.issueCalls).toEqual([]);
    expect(dto.confidence).toBe('low');
  });
});

describe('IntentService — linked docs (FR-006..FR-010, FR-044, SC-006)', () => {
  it('an https://example.com/plan.md link is referenced_not_fetched (host only) with no git or GitHub call', async () => {
    const c = setup({ pull: { body: 'Plan: https://example.com/plan.md' } });
    await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'external_link')).toEqual({
      kind: 'external_link',
      ref: 'example.com',
      status: 'referenced_not_fetched',
    });
    expect(c.fake.state.intent?.sources.some((s) => s.kind === 'plan_doc' || s.kind === 'spec_doc')).toBe(false);
    expect(c.git.fetchedPullHeads).toEqual([]);
    expect(c.git.shownFiles).toEqual([]);
    expect(c.git.readFiles).toEqual([]);
    expect(c.github.issueCalls).toEqual([]);
  });

  it('a linked doc among the changed files: exactly 1 fetchPullHead + 1 showFile(headSha, path), version pr_head, high confidence', async () => {
    const c = setup({
      pull: { body: 'Plan is in plans/rollout.md' },
      files: ['plans/rollout.md', 'src/a.ts'],
      git: { filesAtRef: { [`${HEAD}:plans/rollout.md`]: '# Rollout\nShip the limiter behind a flag.' } },
    });
    const dto = await c.service.derive(WS, 'pr-1');

    expect(c.git.fetchedPullHeads).toEqual([{ repo: { owner: 'acme', name: 'api' }, n: 482 }]);
    expect(c.git.shownFiles).toEqual([{ repo: { owner: 'acme', name: 'api' }, ref: HEAD, path: 'plans/rollout.md' }]);
    expect(c.git.readFiles).toEqual([]);
    expect(sourceOf(c.fake.state.intent, 'plan_doc', 'plans/rollout.md')).toMatchObject({
      status: 'used',
      version: 'pr_head',
    });
    expect(dto.confidence).toBe('high');
    expect(userPrompt(classifierCalls(c.llm)[0]!)).toContain('Ship the limiter behind a flag.');
  });

  it('two changed docs still fetch the PR head only once', async () => {
    const c = setup({
      pull: { body: 'See plans/a.md and specs/b.md' },
      files: ['plans/a.md', 'specs/b.md'],
      git: { filesAtRef: { [`${HEAD}:plans/a.md`]: 'A', [`${HEAD}:specs/b.md`]: 'B' } },
    });
    await c.service.derive(WS, 'pr-1');
    expect(c.git.fetchedPullHeads).toHaveLength(1);
    expect(c.git.shownFiles.map((s) => s.path)).toEqual(['plans/a.md', 'specs/b.md']);
    expect(sourceOf(c.fake.state.intent, 'spec_doc', 'specs/b.md')).toMatchObject({ version: 'pr_head', status: 'used' });
  });

  it('a doc outside the changed files: 0 fetchPullHead, 0 showFile, 1 readFile, version default_branch', async () => {
    const c = setup({
      pull: { body: 'Spec: specs/x.md' },
      files: ['src/a.ts'],
      git: { files: { 'specs/x.md': 'The spec text.' } },
    });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(c.git.fetchedPullHeads).toEqual([]);
    expect(c.git.shownFiles).toEqual([]);
    expect(c.git.readFiles).toEqual([{ repo: { owner: 'acme', name: 'api' }, path: 'specs/x.md' }]);
    const src = sourceOf(c.fake.state.intent, 'spec_doc', 'specs/x.md');
    expect(src).toMatchObject({ status: 'used', version: 'default_branch' });
    expect(src?.reason).toBeUndefined();
    expect(dto.confidence).toBe('high');
  });

  it('fetchPullHead throwing falls back to readFile with reason pr_head_unavailable (version default_branch)', async () => {
    class FailingFetchGit extends MockGitClient {
      override async fetchPullHead(): Promise<void> {
        this.fetchedPullHeads.push({ repo: { owner: '', name: '' }, n: -1 });
        throw new Error('network down');
      }
    }
    const git = new FailingFetchGit({ files: { 'plans/p.md': 'Default-branch copy' } });
    const c = setup({ pull: { body: 'plans/p.md' }, files: ['plans/p.md'], gitClient: git });
    await c.service.derive(WS, 'pr-1');
    expect(git.shownFiles).toEqual([]); // never tried after the failed fetch
    expect(git.readFiles).toHaveLength(1);
    expect(sourceOf(c.fake.state.intent, 'plan_doc', 'plans/p.md')).toMatchObject({
      status: 'used',
      version: 'default_branch',
      reason: 'pr_head_unavailable',
    });
  });

  it('showFile failing (head not in the fetched ref) falls back to readFile with reason pr_head_unavailable', async () => {
    const c = setup({
      pull: { body: 'plans/p.md' },
      files: ['plans/p.md'],
      git: { files: { 'plans/p.md': 'Default-branch copy' } }, // no filesAtRef → showFile throws
    });
    await c.service.derive(WS, 'pr-1');
    expect(c.git.fetchedPullHeads).toHaveLength(1);
    expect(c.git.readFiles).toHaveLength(1);
    expect(sourceOf(c.fake.state.intent, 'plan_doc', 'plans/p.md')).toMatchObject({
      version: 'default_branch',
      reason: 'pr_head_unavailable',
    });
  });

  it('a missing doc is not_found and the derivation still resolves', async () => {
    const c = setup({ pull: { body: 'specs/gone.md' }, files: [] });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'spec_doc', 'specs/gone.md')).toMatchObject({ status: 'not_found' });
    expect(dto.confidence).toBe('low');
    expect(classifierCalls(c.llm)).toHaveLength(1);
  });

  it('a doc whose read throws is not_found too (no failure)', async () => {
    class ThrowingRead extends MockGitClient {
      override async readFile(): Promise<string> {
        throw new Error('Path escapes the repository checkout');
      }
    }
    const c = setup({ pull: { body: 'specs/x.md' }, gitClient: new ThrowingRead() });
    await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'spec_doc', 'specs/x.md')).toMatchObject({ status: 'not_found' });
  });

  it('a path-traversal link is never read', async () => {
    const c = setup({ pull: { body: 'see ../../etc/secret.md' } });
    await c.service.derive(WS, 'pr-1');
    expect(c.git.readFiles).toEqual([]);
    expect(c.git.shownFiles).toEqual([]);
  });

  it('reads at most 3 docs; the rest are referenced_not_fetched (limit)', async () => {
    const files = Object.fromEntries(['a', 'b', 'c', 'd'].map((n) => [`specs/${n}.md`, `doc ${n}`]));
    const c = setup({ pull: { body: 'specs/a.md specs/b.md specs/c.md specs/d.md' }, git: { files } });
    await c.service.derive(WS, 'pr-1');
    expect(c.git.readFiles.map((r) => r.path)).toEqual(['specs/a.md', 'specs/b.md', 'specs/c.md']);
    expect(sourceOf(c.fake.state.intent, 'spec_doc', 'specs/d.md')).toMatchObject({
      status: 'referenced_not_fetched',
      reason: 'limit',
    });
  });

  it('an over-long doc is capped at 8000 chars and marked truncated (still high confidence)', async () => {
    const c = setup({ pull: { body: 'specs/big.md' }, git: { files: { 'specs/big.md': 'w'.repeat(9000) } } });
    const dto = await c.service.derive(WS, 'pr-1');
    expect(sourceOf(c.fake.state.intent, 'spec_doc', 'specs/big.md')).toMatchObject({ status: 'truncated', chars: 8000 });
    expect(dto.confidence).toBe('high');
  });

  it('the review prompt text carries an excerpt of the read doc with its version (FR-026)', async () => {
    const c = setup({ pull: { body: 'specs/x.md' }, git: { files: { 'specs/x.md': 'SPEC-EXCERPT' } } });
    const l = makeLog();
    const res = await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log);
    expect(res?.promptText).toContain('### Linked plan/spec: specs/x.md (default_branch)\nSPEC-EXCERPT');
  });

  it('logs how long the PR-head fetch took when one ran', async () => {
    const c = setup({
      pull: { body: 'plans/p.md' },
      files: ['plans/p.md'],
      git: { filesAtRef: { [`${HEAD}:plans/p.md`]: 'x' } },
    });
    const l = makeLog();
    await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf(['plans/p.md']), l.log);
    expect(l.events.some((e) => e.kind === 'info' && /^PR head fetched in \d+ ms$/.test(e.msg))).toBe(true);
  });
});

describe('IntentService — concurrency (FR-024)', () => {
  /** An LLM that holds its answer until released, so overlapping callers can pile up. */
  function gatedLlm() {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: CLASSIFICATION } });
    const llm: LLMProvider & { inner: MockLLMProvider } = {
      id: 'openai',
      inner,
      listModels: () => inner.listModels(),
      complete: (r) => inner.complete(r),
      embed: (t) => inner.embed(t),
      completeStructured: async <T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> => {
        const result = await inner.completeStructured(req);
        await gate;
        return result;
      },
    };
    return { llm, release };
  }

  it('two concurrent derive calls make a single LLM call and return the same intent', async () => {
    const { llm, release } = gatedLlm();
    const c = setup({ llmDep: async () => llm });
    const a = c.service.derive(WS, 'pr-1');
    const b = c.service.derive(WS, 'pr-1');
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [x, y] = await Promise.all([a, b]);
    expect(classifierCalls(llm.inner)).toHaveLength(1);
    expect(c.fake.state.runs).toHaveLength(1);
    expect(x).toEqual(y);
  });

  it('a "Re-derive" click overlapping a review shares the review\'s in-flight derivation', async () => {
    const { llm, release } = gatedLlm();
    const c = setup({ llmDep: async () => llm });
    const l = makeLog();
    const review = c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log);
    await new Promise((r) => setTimeout(r, 5));
    const click = c.service.derive(WS, 'pr-1');
    await new Promise((r) => setTimeout(r, 20));
    release();
    await Promise.all([review, click]);
    expect(classifierCalls(llm.inner)).toHaveLength(1);
  });

  it('a failed derivation does not poison the next one', async () => {
    let fail = true;
    const inner = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: CLASSIFICATION } });
    const llm: LLMProvider = {
      ...inner,
      id: 'openai',
      listModels: () => inner.listModels(),
      complete: (r) => inner.complete(r),
      embed: (t) => inner.embed(t),
      completeStructured: async (req) => {
        if (fail) throw new Error('boom');
        return inner.completeStructured(req);
      },
    } as LLMProvider;
    const c = setup({ llmDep: async () => llm });
    await expect(c.service.derive(WS, 'pr-1')).rejects.toThrow('boom');
    fail = false;
    await expect(c.service.derive(WS, 'pr-1')).resolves.toMatchObject({ source: 'model' });
  });
});

describe('IntentService — failure isolation (FR-025, FR-032)', () => {
  it('an LLM throw makes resolveForReview return null, completes the intent run as failed, stores nothing and notes it in the run log', async () => {
    const failing: LLMProvider = {
      id: 'openai',
      listModels: async () => [],
      complete: async () => {
        throw new Error('not used');
      },
      embed: async () => [],
      completeStructured: async () => {
        throw new Error('provider 500: SECRET-PROMPT-ECHO');
      },
    };
    const c = setup({ llmDep: async () => failing });
    const l = makeLog();
    const res = await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log);

    expect(res).toBeNull();
    expect(c.fake.state.runs).toHaveLength(1);
    expect(c.fake.state.runs[0]!.completed).toMatchObject({ status: 'failed', costUsd: null });
    expect(c.fake.state.runs[0]!.completed?.error).toContain('provider 500');
    expect(c.fake.state.upserts).toHaveLength(0);
    expect(l.events.some((e) => e.kind === 'info' && e.msg.startsWith('Intent unavailable, review continues without it'))).toBe(true);
    expect(l.events.some((e) => e.kind === 'result')).toBe(false);
  });

  it('derive (the API path) rethrows an LLM failure after completing the run as failed', async () => {
    const failing = {
      id: 'openai',
      completeStructured: async () => {
        throw new Error('provider 500');
      },
    } as unknown as LLMProvider;
    const c = setup({ llmDep: async () => failing });
    await expect(c.service.derive(WS, 'pr-1')).rejects.toThrow('provider 500');
    expect(c.fake.state.runs[0]!.completed).toMatchObject({ status: 'failed' });
  });

  it('a schema failure from the model (provider throws after retries) is treated like any LLM failure', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: { intent_class: 'nonsense' } } });
    const c = setup({ llm });
    const l = makeLog();
    expect(await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log)).toBeNull();
    expect(c.fake.state.intent).toBeUndefined();
  });

  it('a missing provider key (ConfigError) returns null without creating an intent run', async () => {
    const c = setup({
      llmDep: async () => {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      },
    });
    const l = makeLog();
    const res = await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log);
    expect(res).toBeNull();
    expect(c.fake.state.runs).toHaveLength(0);
    expect(l.events.find((e) => e.msg.startsWith('Intent unavailable'))?.msg).toContain('OPENROUTER_API_KEY');
  });

  it('a throwing repository never escapes resolveForReview', async () => {
    const c = setup();
    (c.fake.repo as unknown as { getIntent: () => Promise<never> }).getIntent = async () => {
      throw new Error('db down');
    };
    const l = makeLog();
    await expect(
      c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log),
    ).resolves.toBeNull();
  });
});

describe('IntentService — server logs carry no PR text (FR-036)', () => {
  it('pino lines contain ids, counts, class, hash and cost but not the description, issue or doc text', async () => {
    const lines: { obj: unknown; msg?: string }[] = [];
    const logger = {
      info: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
      warn: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
    };
    const c = setup({
      pull: { body: `${LONG_BODY} DESCRIPTION-SECRET Fixes #5 specs/x.md` },
      issues: { issues: { 5: { title: 'ISSUE-TITLE-SECRET', body: 'ISSUE-BODY-SECRET' } } },
      git: { files: { 'specs/x.md': 'DOC-SECRET' } },
    });
    const l = makeLog();
    await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log, logger);
    await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), l.log, logger);

    expect(lines.map((x) => x.msg)).toEqual(['intent: derived', 'intent: cached']);
    const all = JSON.stringify(lines);
    for (const secret of ['DESCRIPTION-SECRET', 'ISSUE-TITLE-SECRET', 'ISSUE-BODY-SECRET', 'DOC-SECRET', CLASSIFICATION.summary]) {
      expect(all).not.toContain(secret);
    }
    expect(lines[0]!.obj).toMatchObject({
      prId: 'pr-1',
      class: 'feature',
      confidence: 'high',
      cached: false,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    });
    expect((lines[0]!.obj as { inputHash: string }).inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(lines[1]!.obj).toMatchObject({ cached: true });
  });

  it('a failure is logged with the error name only, not its message', async () => {
    const lines: { obj: unknown; msg?: string }[] = [];
    const logger = {
      info: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
      warn: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
    };
    const llm = {
      id: 'openai',
      completeStructured: async () => {
        throw new Error('ECHOED-DESCRIPTION-TEXT');
      },
    } as unknown as LLMProvider;
    const c = setup({ llmDep: async () => llm });
    await c.service.resolveForReview(WS, { ...c.fake.state.pull }, REPO, diffOf([]), makeLog().log, logger);
    expect(lines.at(-1)?.msg).toBe('intent: failed');
    expect(JSON.stringify(lines)).not.toContain('ECHOED-DESCRIPTION-TEXT');
  });
});
