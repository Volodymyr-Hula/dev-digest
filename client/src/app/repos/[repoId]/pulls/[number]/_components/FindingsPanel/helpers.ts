import type { FindingRecord, Severity } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/findings";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Optionally drop low-confidence findings, and other severities (plus dismissed ones) when filtering, then sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  // The severity filter mirrors the counters, which skip dismissed findings.
  if (severity) shown = shown.filter((f) => f.severity === severity && !f.dismissed_at);
  return sortBySeverity(shown);
}
