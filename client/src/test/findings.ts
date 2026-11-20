import type { FindingRecord } from "@devdigest/shared";

/** FindingRecord fixture; override only what a test cares about. */
export function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "id">): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: `Finding ${o.id}`,
    file: "src/app.ts",
    start_line: 10,
    end_line: 10,
    rationale: "Because.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}
