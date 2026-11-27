import type { FindingRow, PullRow } from '../../db/rows.js';

/** The review fields the smart-diff selection reads (a `ReviewRow` satisfies it structurally). */
export interface SmartDiffReview {
  id: string;
  kind: string;
  agentId: string | null;
  createdAt: Date;
}

/** A file changed by the PR; `PrFileRow` satisfies it structurally. */
export interface SmartDiffFile {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * The reads the smart-diff service needs: the PR, its files and its reviews with findings.
 * Declared here so the service depends on a narrow port; `ReviewRepository` satisfies it
 * structurally (wired through `container.reviewRepo`).
 */
export interface SmartDiffReads {
  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined>;
  getPrFiles(prId: string): Promise<SmartDiffFile[]>;
  /** Reviews of a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<{ review: SmartDiffReview; findings: FindingRow[] }[]>;
}
