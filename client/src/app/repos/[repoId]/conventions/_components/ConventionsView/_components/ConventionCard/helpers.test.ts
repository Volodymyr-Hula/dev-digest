import { describe, it, expect } from "vitest";
import { evidenceLabel } from "./helpers";

describe("evidenceLabel", () => {
  it("adds a single line or a range, or keeps the bare path", () => {
    expect(evidenceLabel({ evidence_path: "a.ts", evidence_lines: { start: 3, end: 3 } })).toBe("a.ts:3");
    expect(evidenceLabel({ evidence_path: "a.ts", evidence_lines: { start: 3, end: 7 } })).toBe("a.ts:3-7");
    expect(evidenceLabel({ evidence_path: "a.ts", evidence_lines: null })).toBe("a.ts");
  });
});
