import type { PrIntent, UnifiedDiff } from '@devdigest/shared';
import type { PullRow, RepoRow } from '../../db/rows.js';
import type { RunLogger } from '../../platform/run-logger.js';

/** Where a resolved intent came from. */
export type IntentOrigin = 'cached' | 'derived' | 'user';

/** The intent a review run feeds into its prompt. */
export interface ResolvedIntent {
  dto: PrIntent;
  /** Rendered intent text, passed to the reviewer as `ReviewInput.intent`. */
  promptText: string;
  origin: IntentOrigin;
}

/** The slice of `RunLogger` the intent pre-work writes to. */
export type IntentRunLog = Pick<RunLogger, 'info' | 'tool' | 'result'>;

/** Pino-compatible sink (`(obj, msg)`); intent lines carry ids and counts only, never PR text. */
export type IntentLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/**
 * Port the review executor depends on (reached through the Container so the
 * reviews module never imports the intent module). Never throws for a failed
 * derivation: returns null and the review runs without an intent section.
 */
export interface IntentResolver {
  resolveForReview(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentRunLog,
    logger?: IntentLogger,
  ): Promise<ResolvedIntent | null>;
}

/** A fetched issue handed to the classifier. */
export interface IntentIssueInput {
  number: number;
  role: 'target' | 'background';
  title: string;
  body: string;
}

/** A resolved plan/spec document handed to the classifier. */
export interface IntentDocInput {
  path: string;
  content: string;
  version: 'pr_head' | 'default_branch';
  truncated: boolean;
}

/** Normalised, capped inputs of one derivation (the classifier prompt + the cache hash). */
export interface IntentInputs {
  title: string;
  description: string;
  branch: string;
  commits: string[];
  paths: string[];
  diffStats: { files: number; additions: number; deletions: number };
  issues: IntentIssueInput[];
  docs: IntentDocInput[];
}

/** What `extractReferences` finds in a PR's title, description and branch. */
export interface ExtractedReferences {
  /** Same-repo issue numbers in order of first appearance; `target` when a closing keyword precedes it. */
  issues: { number: number; role: 'target' | 'background' }[];
  /** Jira-style keys (`ABC-12`), never fetched. */
  tickets: string[];
  /** Repo-relative Markdown paths (normalised, deduplicated). */
  docs: string[];
  /** Hosts of links that must not be fetched (non-github.com, or another repo). */
  external: string[];
}
