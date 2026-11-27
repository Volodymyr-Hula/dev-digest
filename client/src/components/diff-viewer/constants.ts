/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Severity → message key (under `prReview.smartDiff`) of the label on a line that hosts a finding. */
export const SEVERITY_LINE_LABEL_KEY: Record<string, string> = {
  CRITICAL: "lineLabel.CRITICAL",
  WARNING: "lineLabel.WARNING",
  SUGGESTION: "lineLabel.SUGGESTION",
};
