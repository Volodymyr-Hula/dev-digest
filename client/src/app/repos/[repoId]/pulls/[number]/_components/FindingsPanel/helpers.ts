import type { FindingRecord, Severity } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/findings";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Findings left after the hide-low-confidence toggle — the base the severity counters tally. */
export function confidentFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** `confidentFindings`, narrowed to one severity when filtering, sorted by severity. Dismissed
 *  findings stay (shown muted), so the list always matches the counters. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = confidentFindings(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return sortBySeverity(shown);
}
