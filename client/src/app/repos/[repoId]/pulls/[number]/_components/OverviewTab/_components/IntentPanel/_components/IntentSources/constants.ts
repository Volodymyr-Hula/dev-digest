import type { IntentSource } from "@devdigest/shared";

export const SOURCE_STATUS_ICON: Record<
  IntentSource["status"],
  { icon: "Check" | "AlertTriangle" | "X" | "Info"; color: string }
> = {
  used: { icon: "Check", color: "var(--ok)" },
  truncated: { icon: "AlertTriangle", color: "var(--warn)" },
  not_found: { icon: "X", color: "var(--crit)" },
  referenced_not_fetched: { icon: "Info", color: "var(--text-muted)" },
  skipped_pull_request: { icon: "Info", color: "var(--text-muted)" },
};

/** Statuses that explain themselves with a short hint line. */
export const HINTED_STATUSES: ReadonlySet<IntentSource["status"]> = new Set([
  "not_found",
  "referenced_not_fetched",
  "skipped_pull_request",
]);
