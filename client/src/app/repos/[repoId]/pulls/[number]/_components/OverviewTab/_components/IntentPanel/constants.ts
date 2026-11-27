import type { IntentClass, IntentConfidence } from "@devdigest/shared";

/* Local mirror of the `IntentClass` / `IntentConfidence` contract enums
   (`server/src/vendor/shared/contracts/brief.ts`) — the client imports only
   types from @devdigest/shared, so the runtime lists live here. Labels are the
   `prIntent.class.*` / `prIntent.confidence.*` message keys. */
export const INTENT_CLASSES: readonly IntentClass[] = [
  "feature",
  "bugfix",
  "refactor",
  "performance",
  "security",
  "docs",
  "tests",
  "dependencies",
  "infra",
  "chore",
  "revert",
  "unknown",
];

export const INTENT_CONFIDENCES: readonly IntentConfidence[] = ["high", "medium", "low"];

export const CONFIDENCE_COLORS: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--crit)", bg: "var(--crit-bg)" },
};
