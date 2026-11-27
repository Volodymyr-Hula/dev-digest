import { describe, it, expect } from "vitest";
// Runtime values from @devdigest/shared are fine in a test (vitest aliases it); only
// app code must stay type-only (client/INSIGHTS.md) — which is why constants.ts mirrors the enums.
import { IntentClass, IntentConfidence, IntentSource } from "@devdigest/shared";
import prIntent from "@/../messages/en/prIntent.json";
import { CONFIDENCE_COLORS, INTENT_CLASSES, INTENT_CONFIDENCES } from "./constants";
import { HINTED_STATUSES, SOURCE_STATUS_ICON } from "./_components/IntentSources/constants";

const sorted = (xs: readonly string[]) => [...xs].sort();

describe("intent enums: client mirror vs @devdigest/shared contract (parity)", () => {
  it("INTENT_CLASSES equals the IntentClass contract enum", () => {
    expect(sorted(INTENT_CLASSES)).toEqual(sorted(IntentClass.options));
    expect(new Set(INTENT_CLASSES).size).toBe(INTENT_CLASSES.length);
  });

  it("INTENT_CONFIDENCES equals the IntentConfidence contract enum", () => {
    expect(sorted(INTENT_CONFIDENCES)).toEqual(sorted(IntentConfidence.options));
    expect(new Set(INTENT_CONFIDENCES).size).toBe(INTENT_CONFIDENCES.length);
    expect(sorted(Object.keys(CONFIDENCE_COLORS))).toEqual(sorted(IntentConfidence.options));
  });

  it("source status helpers cover every IntentSource status in the contract", () => {
    const statuses = IntentSource.shape.status.options;
    expect(sorted(Object.keys(SOURCE_STATUS_ICON))).toEqual(sorted(statuses));
    for (const h of HINTED_STATUSES) expect(statuses).toContain(h);
  });
});

describe("prIntent.json has a message for every contract value", () => {
  const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

  it("every intent class and confidence has a label, and no stale keys remain", () => {
    for (const c of IntentClass.options) expect(nonEmpty(prIntent.class[c]), `class.${c}`).toBe(true);
    for (const c of IntentConfidence.options) expect(nonEmpty(prIntent.confidence[c]), `confidence.${c}`).toBe(true);
    expect(sorted(Object.keys(prIntent.class))).toEqual(sorted(IntentClass.options));
    // `confidence.label` is the field caption, not a value.
    expect(sorted(Object.keys(prIntent.confidence).filter((k) => k !== "label"))).toEqual(
      sorted(IntentConfidence.options),
    );
  });

  it("every source kind, status, version and role has a label; hints exist for each hinted status", () => {
    const shape = IntentSource.shape;
    const groups = {
      kind: shape.kind.options,
      status: shape.status.options,
      version: shape.version.unwrap().options,
      role: shape.role.unwrap().options,
    } as const;
    for (const [group, values] of Object.entries(groups)) {
      const labels = prIntent.sources[group as keyof typeof groups] as Record<string, string>;
      for (const v of values) expect(nonEmpty(labels[v]), `sources.${group}.${v}`).toBe(true);
    }
    const hints = prIntent.sources.hint as Record<string, string>;
    for (const h of HINTED_STATUSES) expect(nonEmpty(hints[h]), `sources.hint.${h}`).toBe(true);
  });
});
