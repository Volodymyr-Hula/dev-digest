import type { SmartDiffRole } from "@devdigest/shared";

/** Per-role header copy (keys under `prReview.smartDiff`) and colour square (existing CSS vars). */
export const ROLE_META: Record<SmartDiffRole, { labelKey: string; descriptionKey: string; color: string }> = {
  core: { labelKey: "coreLabel", descriptionKey: "coreDescription", color: "var(--accent)" },
  tests: { labelKey: "testsLabel", descriptionKey: "testsDescription", color: "var(--ok)" },
  wiring: { labelKey: "wiringLabel", descriptionKey: "wiringDescription", color: "var(--info)" },
  docs: { labelKey: "docsLabel", descriptionKey: "docsDescription", color: "var(--sugg)" },
  boilerplate: {
    labelKey: "boilerplateLabel",
    descriptionKey: "boilerplateDescription",
    color: "var(--text-muted)",
  },
};

/** Groups that start collapsed: the noise. */
export const DEFAULT_COLLAPSED_ROLES: readonly SmartDiffRole[] = ["docs", "boilerplate"];
