import {
  ConventionExtraction,
  type AttachConventionsInput,
  type ConventionCandidate,
  type ConventionsResponse,
  type FeatureModelChoice,
  type GitClient,
  type LLMProvider,
  type Provider,
  type UpdateConventionInput,
} from '@devdigest/shared';
import type { JobRunner } from '../../platform/jobs.js';
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { ConventionsRepository } from './repository.js';
import {
  FILE_CHAR_CAP,
  SAMPLE_N,
  SCAN_ERRORS,
  SCAN_JOB_KIND,
  SCAN_TIMEOUT_MS,
  SELECT_MAX,
} from './constants.js';
import {
  buildExtractionMessages,
  diversifyPaths,
  groundCandidates,
  isActiveJob,
  statsOf,
  toConventionDto,
  toScanState,
} from './helpers.js';

export interface ConventionsServiceDeps {
  repo: ConventionsRepository;
  repoIntel: Pick<RepoIntel, 'getConventionSamples'>;
  git: () => GitClient;
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  jobs: Pick<JobRunner, 'enqueue' | 'register'>;
  now?: () => Date;
}

interface ScanPayload {
  workspaceId: string;
  repoId: string;
}

/**
 * Conventions — scan a repo for house-rules grounded in its code, let the user
 * accept / reject / edit them, and mark the ones that went into a skill.
 * The scan is a JobRunner job; the UI polls `list` for its state.
 */
export class ConventionsService {
  /**
   * Repos whose scan is being started right now. `startScan` reads the latest
   * job and then enqueues; without this, two concurrent requests could both see
   * no active job and start two (paid) scans. One API instance per DB is assumed
   * (as for `reapStaleRuns`).
   */
  private readonly starting = new Set<string>();

  constructor(private readonly deps: ConventionsServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** One-shot at plugin setup (same pattern as the repo-intel index jobs). */
  registerScanJobHandler(): void {
    this.deps.jobs.register(SCAN_JOB_KIND, async (payload) => {
      await this.runScan(payload as ScanPayload);
    });
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsResponse> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [rows, job] = await Promise.all([
      this.deps.repo.listByRepo(workspaceId, repoId),
      this.deps.repo.latestScanJob(workspaceId, repoId),
    ]);
    return {
      scan: toScanState(job, this.now()),
      items: rows.map((r) => toConventionDto(r, repo)),
      stats: statsOf(rows),
    };
  }

  async startScan(workspaceId: string, repoId: string): Promise<{ jobId: string }> {
    await this.requireRepo(workspaceId, repoId);
    const busy = () => new ConflictError('A conventions scan is already running for this repo');
    if (this.starting.has(repoId)) throw busy();
    this.starting.add(repoId);
    try {
      const latest = await this.deps.repo.latestScanJob(workspaceId, repoId);
      if (isActiveJob(latest, this.now())) throw busy();
      const payload: ScanPayload = { workspaceId, repoId };
      const job = await this.deps.jobs.enqueue(workspaceId, SCAN_JOB_KIND, payload, {
        retries: 0,
        timeoutMs: SCAN_TIMEOUT_MS,
      });
      // The outcome is recorded on the jobs row (read back by `list`); nobody awaits `done`.
      job.done.catch(() => {});
      return { jobId: job.id };
    } finally {
      this.starting.delete(repoId);
    }
  }

  /**
   * The job body: code picks the files (ranked sample → per-directory spread),
   * one LLM call extracts conventions, code grounds them and replaces `pending`.
   */
  async runScan({ workspaceId, repoId }: ScanPayload): Promise<void> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const ranked = await this.deps.repoIntel.getConventionSamples(repoId, SAMPLE_N);
    if (ranked.length === 0) throw new ValidationError(SCAN_ERRORS.not_indexed);
    const paths = diversifyPaths(ranked, SELECT_MAX);

    const git = this.deps.git();
    const ref = { owner: repo.owner, name: repo.name };
    const files = new Map<string, string>();
    for (const path of paths) {
      try {
        files.set(path, await git.readFile(ref, path));
      } catch {
        // unreadable (deleted since indexing, escapes the clone) — skip it
      }
    }
    if (files.size === 0) throw new ValidationError(SCAN_ERRORS.no_readable_files);

    const known = await this.deps.repo.knownRules(workspaceId, repoId);
    const capped = new Map([...files].map(([p, c]) => [p, c.slice(0, FILE_CHAR_CAP)]));
    let extraction: ConventionExtraction;
    try {
      const choice = await this.deps.resolveModel(workspaceId);
      const llm = await this.deps.llm(choice.provider);
      const res = await llm.completeStructured({
        model: choice.model,
        schema: ConventionExtraction,
        schemaName: 'ConventionExtraction',
        messages: buildExtractionMessages(capped, known),
      });
      extraction = res.data;
    } catch (e) {
      throw new Error(`${SCAN_ERRORS.llm_failed}: ${(e as Error).message}`);
    }

    const grounded = groundCandidates(extraction.conventions, files, known);
    await this.deps.repo.replacePending(workspaceId, repoId, repo.lastIndexedSha, grounded);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate> {
    const row = await this.deps.repo.getById(workspaceId, id);
    if (!row) throw new NotFoundError('Convention not found');
    if (row.skillId) throw new ConflictError('This convention is already part of a skill');
    const updated = await this.deps.repo.update(workspaceId, id, {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });
    if (!updated) throw new NotFoundError('Convention not found');
    const repo = updated.repoId ? await this.deps.repo.getRepo(workspaceId, updated.repoId) : undefined;
    return toConventionDto(updated, repo ?? null);
  }

  /** Mark accepted conventions as part of a just-created skill. Idempotent. */
  async attach(
    workspaceId: string,
    repoId: string,
    input: AttachConventionsInput,
  ): Promise<{ attached: number }> {
    await this.requireRepo(workspaceId, repoId);
    if (!(await this.deps.repo.skillExists(workspaceId, input.skill_id))) {
      throw new NotFoundError('Skill not found');
    }
    const attached = await this.deps.repo.attach(workspaceId, repoId, input.skill_id, input.ids);
    return { attached };
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }
}
