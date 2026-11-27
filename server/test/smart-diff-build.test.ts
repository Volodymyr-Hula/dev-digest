import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, selectLatestReviewPerAgent } from '../src/modules/smart-diff/helpers.js';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type { SmartDiffReads } from '../src/modules/smart-diff/types.js';
import { AppError } from '../src/platform/errors.js';

/**
 * Smart diff assembly (spec: specs/smart-diff.md FR-002 order, FR-006..FR-009, FR-011, T-003).
 * The selection cases mirror client/src/lib/findings.test.ts (same rule on both sides, FR-008).
 */

const ROLES = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];
const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });
const at = (iso: string) => new Date(iso);

interface Rev {
  id: string;
  kind: string;
  agentId: string | null;
  createdAt: Date;
}
const rev = (id: string, agentId: string | null, iso: string, kind = 'review'): Rev => ({
  id,
  kind,
  agentId,
  createdAt: at(iso),
});

describe('selectLatestReviewPerAgent (FR-008)', () => {
  it('a re-run of the same agent replaces its older review; other agents are kept', () => {
    const picked = selectLatestReviewPerAgent([
      rev('a-old', 'agent-a', '2026-11-20T10:00:00Z'),
      rev('b-1', 'agent-b', '2026-11-19T10:00:00Z'),
      rev('a-new', 'agent-a', '2026-11-21T10:00:00Z'),
    ]);
    expect(picked.map((r) => r.id).sort()).toEqual(['a-new', 'b-1']);
  });

  it('does not depend on the input order (the repository returns newest first)', () => {
    const reviews = [
      rev('a-new', 'agent-a', '2026-11-21T10:00:00Z'),
      rev('a-old', 'agent-a', '2026-11-20T10:00:00Z'),
    ];
    expect(selectLatestReviewPerAgent(reviews).map((r) => r.id)).toEqual(['a-new']);
    expect(selectLatestReviewPerAgent([...reviews].reverse()).map((r) => r.id)).toEqual(['a-new']);
  });

  it('all reviews with a null agent_id form one bucket, separate from real agents', () => {
    const picked = selectLatestReviewPerAgent([
      rev('seed-old', null, '2026-11-18T10:00:00Z'),
      rev('seed-new', null, '2026-11-19T10:00:00Z'),
      rev('agent-1', 'agent-a', '2026-11-17T10:00:00Z'),
    ]);
    expect(picked.map((r) => r.id).sort()).toEqual(['agent-1', 'seed-new']);
  });

  it('a tie on created_at goes to the greater id', () => {
    const same = '2026-11-20T10:00:00Z';
    expect(
      selectLatestReviewPerAgent([rev('aaa', 'agent-a', same), rev('zzz', 'agent-a', same)]).map((r) => r.id),
    ).toEqual(['zzz']);
    expect(
      selectLatestReviewPerAgent([rev('zzz', 'agent-a', same), rev('aaa', 'agent-a', same)]).map((r) => r.id),
    ).toEqual(['zzz']);
  });

  it('ignores summary-kind reviews, even when they are newer', () => {
    const picked = selectLatestReviewPerAgent([
      rev('review', 'agent-a', '2026-11-20T10:00:00Z'),
      rev('summary', 'agent-a', '2026-11-22T10:00:00Z', 'summary'),
      rev('only-summary', 'agent-b', '2026-11-22T10:00:00Z', 'summary'),
    ]);
    expect(picked.map((r) => r.id)).toEqual(['review']);
  });

  it('returns [] for no reviews', () => {
    expect(selectLatestReviewPerAgent([])).toEqual([]);
  });
});

describe('buildSmartDiff', () => {
  it('always returns the 5 groups in fixed order, empty ones included, and parses as SmartDiff (FR-002)', () => {
    const out = buildSmartDiff([file('src/a.ts')], []);
    expect(out.groups.map((g) => g.role)).toEqual(ROLES);
    expect(out.groups.map((g) => g.files.length)).toEqual([1, 0, 0, 0, 0]);
    expect(SmartDiff.safeParse(out).success).toBe(true);

    const empty = buildSmartDiff([], []);
    expect(empty.groups.map((g) => g.role)).toEqual(ROLES);
    expect(empty.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(empty.split_suggestion).toEqual({ too_big: false, total_lines: 0, proposed_splits: [] });
  });

  it('puts every file in exactly one group by role and keeps input order inside a group (FR-006)', () => {
    const paths = [
      'pnpm-lock.yaml',
      'src/z.ts',
      'docs/a.md',
      'src/a.test.ts',
      'src/a.ts',
      '.env.example',
      'src/m.ts',
    ];
    const out = buildSmartDiff(paths.map((p) => file(p)), []);
    const byRole = Object.fromEntries(out.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(byRole).toEqual({
      core: ['src/z.ts', 'src/a.ts', 'src/m.ts'],
      tests: ['src/a.test.ts'],
      wiring: ['.env.example'],
      docs: ['docs/a.md'],
      boilerplate: ['pnpm-lock.yaml'],
    });
    const flat = out.groups.flatMap((g) => g.files.map((f) => f.path));
    expect([...flat].sort()).toEqual([...paths].sort());
  });

  it('carries additions and deletions of each file through unchanged', () => {
    const out = buildSmartDiff([file('src/a.ts', 7, 2)], []);
    expect(out.groups[0]!.files[0]).toMatchObject({ path: 'src/a.ts', additions: 7, deletions: 2 });
  });

  it('finding_lines are the ascending, de-duplicated start_line values of that file only (FR-007)', () => {
    const out = buildSmartDiff(
      [file('src/a.ts'), file('src/b.ts')],
      [
        { file: 'src/a.ts', startLine: 40 },
        { file: 'src/a.ts', startLine: 3 },
        { file: 'src/a.ts', startLine: 40 },
        { file: 'src/b.ts', startLine: 9 },
        { file: 'src/not-in-pr.ts', startLine: 1 },
      ],
    );
    const core = out.groups[0]!.files;
    expect(core.find((f) => f.path === 'src/a.ts')!.finding_lines).toEqual([3, 40]);
    expect(core.find((f) => f.path === 'src/b.ts')!.finding_lines).toEqual([9]);
    // a finding on a file that is not part of the PR appears nowhere
    expect(out.groups.flatMap((g) => g.files).some((f) => f.path === 'src/not-in-pr.ts')).toBe(false);
  });

  it('no findings (no review) → every finding_lines is []; the file is still listed (FR-009)', () => {
    const out = buildSmartDiff([file('src/a.ts'), file('docs/a.md'), file('pnpm-lock.yaml')], []);
    const files = out.groups.flatMap((g) => g.files);
    expect(files).toHaveLength(3);
    expect(files.every((f) => f.finding_lines.length === 0)).toBe(true);
  });

  it('split_suggestion totals every file, never flags too_big and proposes no split (FR-011)', () => {
    const out = buildSmartDiff([file('a.ts', 10, 5), file('pnpm-lock.yaml', 300, 100), file('docs/a.md', 1, 0)], []);
    // 15 + 400 + 1; a huge PR is still not flagged because no LLM split is computed
    expect(out.split_suggestion).toEqual({ too_big: false, total_lines: 416, proposed_splits: [] });
  });

  it('only the latest review per agent contributes lines (re-run of agent A drops its old finding)', () => {
    const reviews = [
      { ...rev('a-old', 'agent-a', '2026-11-20T10:00:00Z'), findings: [{ file: 'src/a.ts', startLine: 3 }] },
      { ...rev('a-new', 'agent-a', '2026-11-21T10:00:00Z'), findings: [{ file: 'src/a.ts', startLine: 7 }] },
      { ...rev('b-1', 'agent-b', '2026-11-19T10:00:00Z'), findings: [{ file: 'src/a.ts', startLine: 12 }] },
      { ...rev('seed', null, '2026-11-18T10:00:00Z'), findings: [{ file: 'src/b.ts', startLine: 5 }] },
    ];
    const selected = selectLatestReviewPerAgent(reviews);
    const out = buildSmartDiff([file('src/a.ts'), file('src/b.ts')], selected.flatMap((r) => r.findings));
    const core = out.groups[0]!.files;
    expect(core.find((f) => f.path === 'src/a.ts')!.finding_lines).toEqual([7, 12]);
    expect(core.find((f) => f.path === 'src/b.ts')!.finding_lines).toEqual([5]);
  });

  it('a dismissed or accepted finding still counts: lines come from every finding of a selected review', () => {
    // The helper takes only file + startLine, so accept/dismiss state cannot hide a line (FR-008).
    const selected = selectLatestReviewPerAgent([
      {
        ...rev('a', 'agent-a', '2026-11-20T10:00:00Z'),
        findings: [
          { file: 'src/a.ts', startLine: 2, dismissedAt: new Date(), acceptedAt: null },
          { file: 'src/a.ts', startLine: 4, dismissedAt: null, acceptedAt: new Date() },
        ],
      },
    ]);
    const out = buildSmartDiff([file('src/a.ts')], selected.flatMap((r) => r.findings));
    expect(out.groups[0]!.files[0]!.finding_lines).toEqual([2, 4]);
  });
});

describe('SmartDiffService.get (FR-003)', () => {
  const repoWith = (files: { path: string; additions: number; deletions: number }[]): SmartDiffReads => ({
    getPull: async () => ({ id: 'pr-1' }) as Awaited<ReturnType<SmartDiffReads['getPull']>>,
    getPrFiles: async () => files,
    reviewsForPull: async () => [],
  });

  it('returns the SmartDiff when the assembled response satisfies the contract', async () => {
    const out = await new SmartDiffService({ repo: repoWith([file('src/a.ts', 3, 1)]) }).get('ws', 'pr-1');
    expect(SmartDiff.safeParse(out).success).toBe(true);
    expect(out.groups[0]!.files[0]).toMatchObject({ path: 'src/a.ts', additions: 3, deletions: 1 });
  });

  it('a response that violates the contract (non-integer additions) rejects with a plain Error, never a ZodError or AppError', async () => {
    const service = new SmartDiffService({ repo: repoWith([file('src/a.ts', 1.5, 0)]) });

    const err = await service.get('ws', 'pr-1').then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    // a ZodError maps to 422 and an AppError to its own status in app.ts; only a plain Error is a 500
    expect(err).not.toBeInstanceOf(ZodError);
    expect(err).not.toBeInstanceOf(AppError);
    expect((err as Error).name).toBe('Error');
    expect((err as { statusCode?: number }).statusCode).toBeUndefined();
  });
});
