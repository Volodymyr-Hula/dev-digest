/* Finding helpers shared by the PR list, the PR timeline and the findings panel. */
import type { FindingRecord, Severity, SeverityCounts } from "@devdigest/shared";

/** Display order of the severity levels (most severe first). */
export const SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** `SeverityCounts` key for a severity level. */
export const COUNT_KEY: Record<Severity, keyof SeverityCounts> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

/** Tally non-dismissed findings per severity — mirrors the server's
 *  `rollupSeverities` + `dismissed_at IS NULL` (PR list `severity_counts`). */
export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.dismissed_at) continue;
    const key = COUNT_KEY[f.severity as Severity];
    if (key) c[key] += 1;
  }
  return c;
}

export function totalCount(c: SeverityCounts): number {
  return c.critical + c.warning + c.suggestion;
}

/** Most severe first; stable within a level. */
export function sortBySeverity<T extends Pick<FindingRecord, "severity">>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
