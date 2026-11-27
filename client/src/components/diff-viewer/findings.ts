/* Agent-finding support for the DiffViewer (Files changed tab).
   Pure helpers + the API shape the viewer needs; findings are the selected
   review findings of the PR, anchored to the NEW side (RIGHT) of the diff. */
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { SEVERITY_ORDER } from "@/lib/findings";

/** What the viewer needs to show findings inline and act on them. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  /** When false, cards, bars and labels are hidden (the file dot stays). */
  showFindings: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  /** Id of the finding whose accept/dismiss request is in flight. */
  pendingId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

/** The line key a finding is matched on: its start line on the new side. */
export function findingKey(f: Pick<FindingRecord, "start_line">): string {
  return `RIGHT:${f.start_line}`;
}

/**
 * Split findings into those whose line is rendered (keyed, selector order kept)
 * and "unanchored" ones (line not in the patch, or no patch) — nothing is dropped.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of findings) {
    const key = findingKey(f);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}

/** The most severe severity in a non-empty list. */
export function topSeverity(list: Pick<FindingRecord, "severity">[]): string {
  return list.reduce(
    (top, f) => ((SEVERITY_ORDER[f.severity] ?? 9) < (SEVERITY_ORDER[top] ?? 9) ? f.severity : top),
    list[0]!.severity,
  );
}
