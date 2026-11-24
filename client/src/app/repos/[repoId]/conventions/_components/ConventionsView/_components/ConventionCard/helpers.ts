import type { ConventionCandidate } from "@devdigest/shared";

/** `path:12` / `path:12-18`, or just the path when the lines are unknown. */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_lines">): string {
  const l = c.evidence_lines;
  if (!l) return c.evidence_path;
  return `${c.evidence_path}:${l.start === l.end ? l.start : `${l.start}-${l.end}`}`;
}
