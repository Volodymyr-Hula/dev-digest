import type { ConventionCandidate, ConventionScanErrorCode, ConventionScanState } from "@devdigest/shared";

export interface ConventionGroups {
  pending: ConventionCandidate[];
  /** Accepted and not yet in a skill — what "Accept as Skill" offers. */
  accepted: ConventionCandidate[];
  inSkills: ConventionCandidate[];
  rejected: ConventionCandidate[];
}

/** Split conventions into the page's sections (server order is kept inside each). */
export function groupConventions(items: readonly ConventionCandidate[]): ConventionGroups {
  const g: ConventionGroups = { pending: [], accepted: [], inSkills: [], rejected: [] };
  for (const c of items) {
    if (c.skill_id) g.inSkills.push(c);
    else if (c.status === "accepted") g.accepted.push(c);
    else if (c.status === "rejected") g.rejected.push(c);
    else g.pending.push(c);
  }
  return g;
}

/** A failed scan: the code picks the message, `detail` is the raw server text (none for `interrupted`). */
export function scanError(
  scan: ConventionScanState | null | undefined,
): { code: ConventionScanErrorCode; detail: string | null } | null {
  if (scan?.status !== "failed") return null;
  const code = scan.error_code ?? "unknown";
  return { code, detail: code === "interrupted" ? null : scan.error };
}

/** What the page shows when there are no conventions (and no scan is running). */
export type EmptyKind = "never" | "noneFound" | "failed";

export function emptyKind(scan: ConventionScanState | null | undefined): EmptyKind {
  if (scan?.status === "failed") return "failed";
  if (scan?.status === "done") return "noneFound";
  return "never";
}
