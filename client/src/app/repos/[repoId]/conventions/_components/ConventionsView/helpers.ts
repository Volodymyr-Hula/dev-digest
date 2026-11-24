import type { ConventionCandidate, ConventionScanState } from "@devdigest/shared";

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

/** The scan error to show, or null. `interrupted` gets its own message key. */
export function scanError(scan: ConventionScanState | null | undefined): { interrupted: boolean; message: string } | null {
  if (scan?.status !== "failed") return null;
  return { interrupted: scan.error === "interrupted", message: scan.error ?? "" };
}
