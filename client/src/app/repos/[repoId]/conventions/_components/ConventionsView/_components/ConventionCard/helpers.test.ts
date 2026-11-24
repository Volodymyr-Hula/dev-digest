import { describe, it, expect } from "vitest";
import { evidenceLabel, statusBadge } from "./helpers";

describe("evidenceLabel", () => {
  it("adds a single line or a range, or keeps the bare path", () => {
    expect(evidenceLabel({ evidence_path: "a.ts", evidence_lines: { start: 3, end: 3 } })).toBe("a.ts:3");
    expect(evidenceLabel({ evidence_path: "a.ts", evidence_lines: { start: 3, end: 7 } })).toBe("a.ts:3-7");
    expect(evidenceLabel({ evidence_path: "a.ts", evidence_lines: null })).toBe("a.ts");
  });
});

describe("statusBadge", () => {
  it("prefers the skill membership, then the status; pending has none", () => {
    expect(statusBadge({ status: "accepted", skill_id: "sk" })).toEqual({ key: "inSkill" });
    expect(statusBadge({ status: "accepted", skill_id: null })).toEqual({ key: "accepted", color: "var(--ok)" });
    expect(statusBadge({ status: "rejected", skill_id: null })).toEqual({ key: "rejected" });
    expect(statusBadge({ status: "pending", skill_id: null })).toBeNull();
  });
});
