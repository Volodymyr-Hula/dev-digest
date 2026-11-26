import { describe, it, expect } from "vitest";
import type { ConventionCandidate, ConventionScanState } from "@devdigest/shared";
import { emptyKind, groupConventions, scanError } from "./helpers";

const c = (id: string, status: ConventionCandidate["status"], skill_id: string | null = null): ConventionCandidate => ({
  id,
  rule: id,
  evidence_path: "a.ts",
  evidence_snippet: "x",
  evidence_lines: null,
  evidence_url: null,
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

const scan = (status: ConventionScanState["status"], error: string | null = null, error_code: ConventionScanState["error_code"] = null): ConventionScanState => ({
  status,
  error,
  error_code,
  started_at: null,
  finished_at: null,
});

describe("scanError", () => {
  it("reports only failed scans, by code, with the raw text as detail", () => {
    expect(scanError(null)).toBeNull();
    expect(scanError(scan("done"))).toBeNull();
    expect(scanError(scan("failed", "interrupted", "interrupted"))).toEqual({ code: "interrupted", detail: null });
    expect(scanError(scan("failed", "Model call failed: 401", "llm_failed"))).toEqual({
      code: "llm_failed",
      detail: "Model call failed: 401",
    });
    expect(scanError(scan("failed", "boom"))).toEqual({ code: "unknown", detail: "boom" });
  });
});

describe("emptyKind", () => {
  it("tells a never-run page from an empty result and a failure", () => {
    expect(emptyKind(null)).toBe("never");
    expect(emptyKind(scan("done"))).toBe("noneFound");
    expect(emptyKind(scan("failed", "x", "unknown"))).toBe("failed");
  });
});
