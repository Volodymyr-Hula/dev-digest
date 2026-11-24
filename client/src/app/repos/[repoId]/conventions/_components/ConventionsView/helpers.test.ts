import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { groupConventions, scanError } from "./helpers";

const c = (id: string, status: ConventionCandidate["status"], skill_id: string | null = null): ConventionCandidate => ({
  id,
  rule: id,
  evidence_path: "a.ts",
  evidence_snippet: "x",
  confidence: 0.5,
  status,
  skill_id,
  created_at: "2026-11-24T00:00:00Z",
});

describe("groupConventions", () => {
  it("puts skill members in inSkills regardless of status, the rest by status", () => {
    const g = groupConventions([c("p", "pending"), c("a", "accepted"), c("s", "accepted", "sk"), c("r", "rejected")]);
    expect(g.pending.map((x) => x.id)).toEqual(["p"]);
    expect(g.accepted.map((x) => x.id)).toEqual(["a"]);
    expect(g.inSkills.map((x) => x.id)).toEqual(["s"]);
    expect(g.rejected.map((x) => x.id)).toEqual(["r"]);
  });
});

describe("scanError", () => {
  it("reports only failed scans and flags interruption", () => {
    expect(scanError(null)).toBeNull();
    expect(scanError({ status: "done", error: null, started_at: null, finished_at: null })).toBeNull();
    expect(scanError({ status: "failed", error: "interrupted", started_at: null, finished_at: null })).toEqual({
      interrupted: true,
      message: "interrupted",
    });
    expect(scanError({ status: "failed", error: "boom", started_at: null, finished_at: null })).toEqual({
      interrupted: false,
      message: "boom",
    });
  });
});
