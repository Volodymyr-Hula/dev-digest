import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';
import { ROLE_RULES, SMART_DIFF_ROLE_ORDER } from './constants.js';

/** The role of a changed file: the first matching rule set, `core` when none matches. */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of ROLE_RULES) {
    if (rule.patterns.some((p) => p.test(path))) return rule.role;
  }
  return 'core';
}

/**
 * The latest `kind='review'` review per agent (all `agentId = null` reviews form
 * one bucket): newest `createdAt`, tie-broken by the greater `id`.
 */
export function selectLatestReviewPerAgent<
  R extends { kind: string; agentId: string | null; createdAt: Date; id: string },
>(reviews: readonly R[]): R[] {
  const latest = new Map<string | null, R>();
  for (const r of reviews) {
    if (r.kind !== 'review') continue;
    const key = r.agentId ?? null;
    const cur = latest.get(key);
    if (!cur) {
      latest.set(key, r);
      continue;
    }
    const diff = r.createdAt.getTime() - cur.createdAt.getTime();
    if (diff > 0 || (diff === 0 && r.id > cur.id)) latest.set(key, r);
  }
  return [...latest.values()];
}

/** Five groups in `SMART_DIFF_ROLE_ORDER` (empty ones kept); files keep their input order. */
export function buildSmartDiff(
  files: readonly { path: string; additions: number; deletions: number }[],
  findings: readonly { file: string; startLine: number }[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    linesByFile.set(f.file, set);
  }

  const groups = SMART_DIFF_ROLE_ORDER.map((role) => ({
    role,
    files: [] as SmartDiff['groups'][number]['files'],
  }));
  let totalLines = 0;
  for (const file of files) {
    const group = groups.find((g) => g.role === classifyFile(file.path))!;
    group.files.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
    });
    totalLines += file.additions + file.deletions;
  }

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
