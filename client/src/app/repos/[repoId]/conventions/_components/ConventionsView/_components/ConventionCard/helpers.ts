import type { ConventionCandidate } from "@devdigest/shared";

/** `path:12` / `path:12-18`, or just the path when the lines are unknown. */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_lines">): string {
  const l = c.evidence_lines;
  if (!l) return c.evidence_path;
  return `${c.evidence_path}:${l.start === l.end ? l.start : `${l.start}-${l.end}`}`;
}

/** The card's status badge: in a skill, accepted, rejected, or none (pending). */
export function statusBadge(
  c: Pick<ConventionCandidate, "status" | "skill_id">,
): { key: "inSkill" | "accepted" | "rejected"; color?: string } | null {
  if (c.skill_id) return { key: "inSkill" };
  if (c.status === "accepted") return { key: "accepted", color: "var(--ok)" };
  if (c.status === "rejected") return { key: "rejected" };
  return null;
}
