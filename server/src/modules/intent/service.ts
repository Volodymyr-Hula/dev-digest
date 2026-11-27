import {
  IntentClassification,
  type FeatureModelChoice,
  type GitClient,
  type GitHubClient,
  type IntentSource,
  type LLMProvider,
  type PrIntent,
  type PrIntentUpdate,
  type Provider,
  type RepoRef,
  type StructuredResult,
  type UnifiedDiff,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import type { IntentRepository, PullRow, RepoRow } from './repository.js';
import {
  CLASSIFIER_MAX_RETRIES,
  CLASSIFIER_TIMEOUT_MS,
  INPUT_CAPS,
  INTENT_SCHEMA_NAME,
  MAX_RUN_ERROR_CHARS,
} from './constants.js';
import {
  buildClassifierMessages,
  buildIntentInputs,
  capClassification,
  capText,
  computeConfidence,
  docKind,
  extractReferences,
  inputHash,
  renderIntentForPrompt,
  toPrIntentDto,
} from './helpers.js';
import type {
  IntentDocInput,
  IntentIssueInput,
  IntentLogger,
  IntentOrigin,
  IntentResolver,
  IntentRunLog,
  ResolvedIntent,
} from './types.js';

export interface IntentServiceDeps {
  repo: IntentRepository;
  /** Lazy: throws `ConfigError` when no GitHub token is configured. */
  github: () => Promise<GitHubClient>;
  git: () => GitClient;
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  /** Millisecond clock (tests inject one). */
  now?: () => number;
}

/** One finished derivation (or cache hit), before it is shaped for a caller. */
interface Derived {
  dto: PrIntent;
  /** Plan/spec docs that were read (their excerpts go into the reviewer prompt). */
  docs: IntentDocInput[];
  /** Freshly resolved sources of this run (the stored DTO's list can only differ on a cache hit by timing). */
  sources: IntentSource[];
  origin: Extract<IntentOrigin, 'cached' | 'derived'>;
  prHeadFetchMs: number | null;
}

type FileStat = { path: string; additions: number; deletions: number };

/** Error text that is safe for a log line: no model output, no PR text. */
function safeMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return err instanceof Error ? err.name : 'Error';
}

/**
 * PR intent — why a PR exists. Gathers the PR's own words (title, description,
 * commits), linked issues and plan/spec docs, asks a cheap model to classify
 * them once, computes confidence in code, and stores the result per
 * (head sha, input hash). A user-written intent always wins over the model's.
 */
export class IntentService implements IntentResolver {
  /** Derivations running now, by PR: an overlapping caller awaits the first instead of paying twice. */
  private readonly inflight = new Map<string, Promise<Derived>>();

  constructor(private readonly deps: IntentServiceDeps) {}

  private clock(): number {
    return this.deps.now?.() ?? Date.now();
  }

  async get(workspaceId: string, prId: string): Promise<PrIntent | null> {
    const pull = await this.requirePull(workspaceId, prId);
    const stored = await this.deps.repo.getIntent(prId);
    return stored ? toPrIntentDto(stored.row, pull.headSha, stored.costUsd) : null;
  }

  /** Derive now, bypassing the cache (and replacing a user-written intent). */
  async derive(workspaceId: string, prId: string, logger?: IntentLogger): Promise<PrIntent> {
    const pull = await this.requirePull(workspaceId, prId);
    try {
      const repo = await this.deps.repo.getRepo(workspaceId, pull.repoId);
      if (!repo) throw new NotFoundError('Repository not found');
      const files = await this.deps.repo.getPrFiles(pull.id);
      const derived = await this.dedupe(pull.id, () =>
        this.compute(workspaceId, pull, repo, files, true, logger),
      );
      return derived.dto;
    } catch (err) {
      logger?.warn({ prId, errorName: (err as Error).name }, 'intent: failed');
      throw err;
    }
  }

  /** Store a user-written intent: confidence `high`, tied to the PR's current head. */
  async update(workspaceId: string, prId: string, input: PrIntentUpdate): Promise<PrIntent> {
    const pull = await this.requirePull(workspaceId, prId);
    const existing = await this.deps.repo.getIntent(prId);
    const row = await this.deps.repo.upsertIntent({
      prId,
      intent: input.intent,
      inScope: input.in_scope,
      outOfScope: input.out_of_scope,
      intentClass: input.intent_class,
      rationale: null,
      confidence: 'high',
      sources: existing?.row.sources ?? [],
      source: 'user',
      headSha: pull.headSha,
      inputHash: null,
      provider: null,
      model: null,
      runId: null,
    });
    return toPrIntentDto(row, pull.headSha, null);
  }

  /**
   * Intent for a review run. Never throws: a failed derivation (missing key,
   * model error, schema failure) is noted in the run log and the review goes on
   * without an intent section.
   */
  async resolveForReview(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentRunLog,
    logger?: IntentLogger,
  ): Promise<ResolvedIntent | null> {
    try {
      log.tool('Deriving PR intent');
      const stored = await this.deps.repo.getIntent(pull.id);
      let dto: PrIntent;
      let docs: IntentDocInput[] = [];
      let sources: IntentSource[];
      let origin: IntentOrigin;
      if (stored?.row.source === 'user') {
        // A human statement beats the model's guess, even when the head moved.
        dto = toPrIntentDto(stored.row, pull.headSha, stored.costUsd);
        sources = dto.sources;
        origin = 'user';
        logger?.info({ prId: pull.id, class: dto.intent_class, origin }, 'intent: cached');
      } else {
        const files = diff.files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
        }));
        const derived = await this.dedupe(pull.id, () =>
          this.compute(workspaceId, pull, repo, files, false, logger),
        );
        ({ dto, docs, sources, origin } = derived);
        if (derived.prHeadFetchMs !== null) {
          log.info(`PR head fetched in ${derived.prHeadFetchMs} ms`);
        }
      }
      for (const s of sources) {
        log.info(`Intent source ${s.kind} ${s.ref}: ${s.status}${s.version ? ` (${s.version})` : ''}`);
      }
      log.result(`Intent: ${dto.intent_class} (confidence ${dto.confidence}, ${origin})`);
      return { dto, promptText: renderIntentForPrompt(dto, docs), origin };
    } catch (err) {
      log.info(`Intent unavailable, review continues without it: ${safeMessage(err)}`);
      logger?.warn({ prId: pull.id, errorName: (err as Error).name }, 'intent: failed');
      return null;
    }
  }

  // ---- derivation ------------------------------------------------------------

  private dedupe(prId: string, run: () => Promise<Derived>): Promise<Derived> {
    const running = this.inflight.get(prId);
    if (running) return running;
    const promise = run().finally(() => this.inflight.delete(prId));
    this.inflight.set(prId, promise);
    return promise;
  }

  private async compute(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    files: FileStat[],
    force: boolean,
    logger?: IntentLogger,
  ): Promise<Derived> {
    const started = this.clock();
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const refs = extractReferences(pull.title, pull.body ?? '', pull.branch, repo.owner, repo.name);
    const commits = await this.deps.repo.getPrCommits(pull.id);

    const linked: IntentSource[] = [];
    const issues = await this.resolveIssues(refs.issues, ref, linked);
    const { docs, prHeadFetchMs } = await this.resolveDocs(refs.docs, pull, ref, files, linked);
    for (const key of refs.tickets) {
      linked.push({ kind: 'ticket_key', ref: key, status: 'referenced_not_fetched' });
    }
    for (const host of refs.external) {
      linked.push({ kind: 'external_link', ref: host, status: 'referenced_not_fetched' });
    }

    const { inputs, truncated } = buildIntentInputs({
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      commitMessages: commits.map((c) => c.message),
      files,
      issues,
      docs,
    });
    const sources: IntentSource[] = [
      {
        kind: 'title',
        ref: 'title',
        status: truncated.title ? 'truncated' : 'used',
        chars: inputs.title.length,
      },
      ...(inputs.description
        ? [
            {
              kind: 'description' as const,
              ref: 'description',
              status: truncated.description ? ('truncated' as const) : ('used' as const),
              chars: inputs.description.length,
            },
          ]
        : []),
      { kind: 'branch', ref: pull.branch, status: 'used' },
      ...(inputs.commits.length > 0
        ? [{ kind: 'commits' as const, ref: `${inputs.commits.length} commit(s)`, status: 'used' as const }]
        : []),
      ...(files.length > 0
        ? [{ kind: 'paths' as const, ref: `${files.length} file(s)`, status: 'used' as const }]
        : []),
      {
        kind: 'diff_stats',
        ref: `+${inputs.diffStats.additions}/-${inputs.diffStats.deletions}`,
        status: 'used',
      },
      ...linked,
    ];

    const choice = await this.deps.resolveModel(workspaceId);
    const hash = inputHash(inputs, choice.provider, choice.model);

    if (!force) {
      const stored = await this.deps.repo.getIntent(pull.id);
      if (
        stored &&
        stored.row.source === 'model' &&
        stored.row.headSha === pull.headSha &&
        stored.row.inputHash === hash
      ) {
        const dto = toPrIntentDto(stored.row, pull.headSha, stored.costUsd);
        this.logDone(logger, pull.id, dto, sources, 'cached', prHeadFetchMs, started, hash, null);
        return { dto, docs, sources, origin: 'cached', prHeadFetchMs };
      }
    }

    // The provider is resolved before the run row exists: a missing key is a
    // config error, not an LLM call.
    const llm = await this.deps.llm(choice.provider);
    const runId = await this.deps.repo.createIntentRun({
      workspaceId,
      prId: pull.id,
      provider: choice.provider,
      model: choice.model,
    });
    const callStart = this.clock();
    let result: StructuredResult<IntentClassification>;
    try {
      result = await llm.completeStructured({
        model: choice.model,
        schema: IntentClassification,
        schemaName: INTENT_SCHEMA_NAME,
        messages: buildClassifierMessages(inputs),
        maxRetries: CLASSIFIER_MAX_RETRIES,
        timeoutMs: CLASSIFIER_TIMEOUT_MS,
      });
    } catch (err) {
      await this.deps.repo
        .completeIntentRun(runId, {
          status: 'failed',
          durationMs: this.clock() - callStart,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          error: (err instanceof Error ? err.message : String(err)).slice(0, MAX_RUN_ERROR_CHARS),
        })
        .catch(() => undefined);
      throw err;
    }
    await this.deps.repo.completeIntentRun(runId, {
      status: 'done',
      durationMs: this.clock() - callStart,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    const out = capClassification(result.data);
    const row = await this.deps.repo.upsertIntent({
      prId: pull.id,
      intent: out.summary,
      inScope: out.in_scope,
      outOfScope: out.out_of_scope,
      intentClass: out.intent_class,
      rationale: out.rationale,
      confidence: computeConfidence(sources, pull.body),
      sources,
      source: 'model',
      headSha: pull.headSha,
      inputHash: hash,
      provider: choice.provider,
      model: choice.model,
      runId,
    });
    const dto = toPrIntentDto(row, pull.headSha, result.costUsd);
    this.logDone(logger, pull.id, dto, sources, 'derived', prHeadFetchMs, started, hash, result);
    return { dto, docs, sources, origin: 'derived', prHeadFetchMs };
  }

  /** Pino line: ids, counts, hashes and numbers only. Never description, issue or doc text. */
  private logDone(
    logger: IntentLogger | undefined,
    prId: string,
    dto: PrIntent,
    sources: IntentSource[],
    origin: 'cached' | 'derived',
    prHeadFetchMs: number | null,
    started: number,
    hash: string,
    result: { tokensIn: number; tokensOut: number; costUsd: number | null } | null,
  ): void {
    logger?.info(
      {
        prId,
        class: dto.intent_class,
        confidence: dto.confidence,
        sourceKinds: [...new Set(sources.map((s) => s.kind))],
        cached: origin === 'cached',
        prHeadFetchMs,
        tokensIn: result?.tokensIn ?? 0,
        tokensOut: result?.tokensOut ?? 0,
        costUsd: result?.costUsd ?? null,
        durationMs: this.clock() - started,
        inputHash: hash,
      },
      `intent: ${origin}`,
    );
  }

  /** Fetch the linked same-repo issues (at most 3). Failures never abort the derivation. */
  private async resolveIssues(
    refs: { number: number; role: 'target' | 'background' }[],
    repo: RepoRef,
    sources: IntentSource[],
  ): Promise<IntentIssueInput[]> {
    const out: IntentIssueInput[] = [];
    if (refs.length === 0) return out;

    let github: GitHubClient | null = null;
    let unavailable = '';
    try {
      github = await this.deps.github();
    } catch (err) {
      unavailable = err instanceof ConfigError ? 'no_github_token' : 'github_unavailable';
    }

    for (const [i, r] of refs.entries()) {
      const base = { kind: 'linked_issue' as const, ref: `#${r.number}`, role: r.role };
      if (i >= INPUT_CAPS.issues) {
        sources.push({ ...base, status: 'referenced_not_fetched', reason: 'limit' });
        continue;
      }
      if (!github) {
        sources.push({ ...base, status: 'referenced_not_fetched', reason: unavailable });
        continue;
      }
      try {
        const issue = await github.getIssue(repo, r.number);
        if (issue.is_pull_request) {
          sources.push({ ...base, status: 'skipped_pull_request' });
          continue;
        }
        const body = capText(issue.body ?? '', INPUT_CAPS.issueBody);
        out.push({ number: r.number, role: r.role, title: issue.title, body: body.text });
        sources.push({
          ...base,
          status: body.truncated ? 'truncated' : 'used',
          chars: body.text.length,
        });
      } catch {
        sources.push({ ...base, status: 'not_found' });
      }
    }
    return out;
  }

  /**
   * Read the linked plan/spec docs (at most 3). A doc the PR changes is read at
   * the PR head (one `fetchPullHead` for the whole derivation); any other doc, or
   * one whose PR-head read failed, comes from the default-branch checkout.
   */
  private async resolveDocs(
    paths: string[],
    pull: PullRow,
    repo: RepoRef,
    files: FileStat[],
    sources: IntentSource[],
  ): Promise<{ docs: IntentDocInput[]; prHeadFetchMs: number | null }> {
    const docs: IntentDocInput[] = [];
    for (const path of paths.slice(INPUT_CAPS.docs)) {
      sources.push({
        kind: docKind(path),
        ref: path,
        status: 'referenced_not_fetched',
        reason: 'limit',
      });
    }
    const changed = new Set(files.map((f) => f.path));
    const git = this.deps.git();
    let prHeadReady: boolean | null = null;
    let prHeadFetchMs: number | null = null;

    for (const path of paths.slice(0, INPUT_CAPS.docs)) {
      const kind = docKind(path);
      let content: string | undefined;
      let version: IntentDocInput['version'] = 'default_branch';
      let reason: string | undefined;

      if (changed.has(path)) {
        if (prHeadReady === null) {
          const t0 = this.clock();
          try {
            await git.fetchPullHead(repo, pull.number);
            prHeadReady = true;
          } catch {
            prHeadReady = false;
          }
          prHeadFetchMs = this.clock() - t0;
        }
        if (prHeadReady) {
          try {
            content = await git.showFile(repo, pull.headSha, path);
            version = 'pr_head';
          } catch {
            /* fall back to the default branch below */
          }
        }
        if (content === undefined) reason = 'pr_head_unavailable';
      }
      if (content === undefined) {
        try {
          content = await git.readFile(repo, path);
          version = 'default_branch';
        } catch {
          /* recorded as not_found below */
        }
      }
      if (content === undefined || content.trim().length === 0) {
        sources.push({ kind, ref: path, status: 'not_found', ...(reason ? { reason } : {}) });
        continue;
      }
      const capped = capText(content, INPUT_CAPS.doc);
      docs.push({ path, content: capped.text, version, truncated: capped.truncated });
      sources.push({
        kind,
        ref: path,
        status: capped.truncated ? 'truncated' : 'used',
        version,
        chars: capped.text.length,
        ...(reason ? { reason } : {}),
      });
    }
    return { docs, prHeadFetchMs };
  }

  private async requirePull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }
}
