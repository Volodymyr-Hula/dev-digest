# Wrong → right examples

Pairs for the rules in [../SKILL.md](../SKILL.md), taken from `server/src/`. "Wrong" snippets are real code, shortened (see `known-deviations.md`). "Right" snippets show the target shape; names such as `PullsRepository` don't exist yet.

## Contents

1. GitHub + DB in a route handler (rules 1–3)
2. Job enqueue in a route handler (rules 1–2)
3. Secrets and LLM in a route handler (rules 1–2)
4. Concrete adapter built in a service (rule 4)
5. Vendor-shaped port (rule 6)
6. Drizzle schema imported for a row type (rule 3)

## 1. GitHub + DB in a route handler

Wrong — `modules/pulls/routes.ts:194-247`:

```ts
app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
  const { workspaceId } = await getContext(container, req);
  const [pr] = await container.db.select().from(t.pullRequests).where(/* … */);
  if (!pr) throw new NotFoundError('Pull request not found');
  const gh = await container.github();
  const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
  await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
  // … inserts, update, fallback reads …
});
```

Right:

```ts
// routes.ts — setup
const service = new PullsService({
  repo: new PullsRepository(container.db),
  github: () => container.github(),
  log: app.log,
});
// routes.ts — handler
app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
  const { workspaceId } = await getContext(container, req);
  return service.getDetail(workspaceId, req.params.id);
});

// service.ts
async getDetail(workspaceId: string, prId: string): Promise<PrDetail> {
  const { pr, repo } = await this.deps.repo.getPrWithRepo(workspaceId, prId); // throws NotFoundError
  try {
    const detail = await (await this.deps.github()).getPullRequest(toRepoRef(repo), pr.number);
    await this.deps.repo.replaceDetail(pr.id, detail);
    return { ...detail, id: pr.id };
  } catch (err) {
    this.deps.log.warn({ err }, 'GitHub PR detail refresh skipped; serving persisted detail');
    return this.deps.repo.getPersistedDetail(pr);
  }
}
```

The offline fallback is a use-case decision, so it lives in the service. The SQL lives in the repository.

## 2. Job enqueue in a route handler

Wrong — `modules/repo-intel/routes.ts:46-60`:

```ts
const { workspaceId } = await getContext(container, req);
let jobId: string | null = null;
try {
  const job = await container.jobs.enqueue(workspaceId, RESYNC_JOB_KIND, { repoId: req.params.id });
  jobId = job.id;
} catch { /* degraded */ }
reply.code(202);
return jobId ? { status: 'accepted', jobId } : { status: 'accepted', degraded: true, reason: 'no_handler' };
```

Right:

```ts
// handler
const { workspaceId } = await getContext(container, req);
reply.code(202);
return service.requestResync(workspaceId, req.params.id); // owns enqueue + degraded result
```

## 3. Secrets and LLM in a route handler

Wrong — `modules/settings/routes.ts:79-102`. The handler builds candidate clients (`githubWithToken`, `llmWithKey`), checks them, writes `container.secrets.set` and calls `invalidateSecretCaches()`.

Right: `SettingsService.testConnection(provider, key)` gets `deps` such as `{ secrets, github, githubWithToken, llm, llmWithKey, invalidateSecretCaches }`, wired in plugin setup as lazy functions. It keeps the S11 order: verify the candidate key, persist only on success, then invalidate caches, and redact the key from error messages. The handler is `return service.testConnection(req.body.provider, req.body.key)`.

## 4. Concrete adapter built in a service

Wrong:

```ts
// modules/<m>/service.ts
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
const gh = new OctokitGitHubClient(await this.container.secrets.get('GITHUB_TOKEN'));
```

Right: the service asks for the port, and only `platform/container.ts` knows `OctokitGitHubClient`:

```ts
constructor(private readonly deps: { github: () => Promise<GitHubClient> }) {}
const gh = await this.deps.github(); // ConfigError if no token; mockable via overrides.github
```

## 5. Vendor-shaped port

Wrong:

```ts
import type { RestEndpointMethodTypes } from '@octokit/rest';
export interface GitHubClient {
  listPulls(params: RestEndpointMethodTypes['pulls']['list']['parameters']):
    Promise<RestEndpointMethodTypes['pulls']['list']['response']>;
}
```

Right — the shape the core needs, with DTOs from `@devdigest/shared` (`vendor/shared/adapters.ts` `GitHubClient`):

```ts
getPullRequest(repo: RepoRef, number: number): Promise<PrDetail>;
```

## 6. Drizzle schema imported for a row type

Wrong — `modules/reviews/diff-loader.ts:4`, `run-executor.ts:5`, `repos/helpers.ts:2`:

```ts
import * as schema from '../../db/schema.js';
repoRow: typeof schema.repos.$inferSelect,
```

Right — add the row type once in `db/rows.ts`, next to the existing `PullRow`, `AgentRow`:

```ts
// db/rows.ts
export type RepoRow = typeof t.repos.$inferSelect;
// consumer
import type { RepoRow } from '../../db/rows.js';
```
