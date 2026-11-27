import { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { SmartDiffReads } from './types.js';
import { buildSmartDiff, selectLatestReviewPerAgent } from './helpers.js';

export interface SmartDiffServiceDeps {
  repo: SmartDiffReads;
}

/** Role-ordered view of a PR's files with finding lines. Reads only; never calls an LLM. */
export class SmartDiffService {
  constructor(private readonly deps: SmartDiffServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const { repo } = this.deps;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, reviews] = await Promise.all([repo.getPrFiles(prId), repo.reviewsForPull(prId)]);
    const selected = selectLatestReviewPerAgent(reviews.map((r) => ({ ...r.review, findings: r.findings })));
    const result = buildSmartDiff(
      files,
      selected.flatMap((r) => r.findings),
    );
    // Explicit safeParse: a shape violation is a 500, never a malformed 200. A plain Error
    // (not a ZodError, which app.ts maps to 422) falls through to the 500 handler.
    const parsed = SmartDiff.safeParse(result);
    if (!parsed.success) {
      throw new Error(`smart-diff response violates the SmartDiff contract: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}
