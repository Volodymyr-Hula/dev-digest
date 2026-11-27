import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { finding } from "@/test/findings";
import { selectLatestFindings } from "./findings";

/**
 * Smart-diff selection rule on the client (spec: specs/smart-diff.md FR-008, FR-035, T-007).
 * Same case table as server/test/smart-diff-build.test.ts (`selectLatestReviewPerAgent`).
 */

function review(
  id: string,
  agentId: string | null,
  createdAt: string,
  findingIds: string[],
  kind: ReviewRecord["kind"] = "review",
): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: null,
    kind,
    verdict: "comment",
    summary: "s",
    score: 50,
    model: "m",
    created_at: createdAt,
    findings: findingIds.map((fid) => finding({ id: fid, review_id: id })),
  };
}

const ids = (list: { id: string }[]) => list.map((f) => f.id).sort();

describe("selectLatestFindings", () => {
  it("a re-run of the same agent replaces its older review; other agents are kept", () => {
    const out = selectLatestFindings([
      review("a-old", "agent-a", "2026-11-20T10:00:00Z", ["old-1", "old-2"]),
      review("b", "agent-b", "2026-11-19T10:00:00Z", ["b-1"]),
      review("a-new", "agent-a", "2026-11-21T10:00:00Z", ["new-1"]),
    ]);
    expect(ids(out)).toEqual(["b-1", "new-1"]);
  });

  it("does not depend on input order (the API returns newest first)", () => {
    const newest = review("a-new", "agent-a", "2026-11-21T10:00:00Z", ["new"]);
    const oldest = review("a-old", "agent-a", "2026-11-20T10:00:00Z", ["old"]);
    expect(ids(selectLatestFindings([newest, oldest]))).toEqual(["new"]);
    expect(ids(selectLatestFindings([oldest, newest]))).toEqual(["new"]);
  });

  it("all reviews with a null agent_id share one bucket, separate from real agents", () => {
    const out = selectLatestFindings([
      review("seed-old", null, "2026-11-18T10:00:00Z", ["seed-old-f"]),
      review("seed-new", null, "2026-11-19T10:00:00Z", ["seed-new-f"]),
      review("agent", "agent-a", "2026-11-17T10:00:00Z", ["agent-f"]),
    ]);
    expect(ids(out)).toEqual(["agent-f", "seed-new-f"]);
  });

  it("a tie on created_at goes to the greater id, whatever the order", () => {
    const same = "2026-11-20T10:00:00Z";
    const lo = review("aaa", "agent-a", same, ["from-aaa"]);
    const hi = review("zzz", "agent-a", same, ["from-zzz"]);
    expect(ids(selectLatestFindings([lo, hi]))).toEqual(["from-zzz"]);
    expect(ids(selectLatestFindings([hi, lo]))).toEqual(["from-zzz"]);
  });

  it("excludes summary-kind reviews, even when newer than the review", () => {
    const out = selectLatestFindings([
      review("rev", "agent-a", "2026-11-20T10:00:00Z", ["from-review"]),
      review("sum", "agent-a", "2026-11-22T10:00:00Z", ["from-summary"], "summary"),
      review("sum-only", "agent-b", "2026-11-22T10:00:00Z", ["only-summary"], "summary"),
    ]);
    expect(ids(out)).toEqual(["from-review"]);
  });

  it("keeps accepted and dismissed findings of the selected review", () => {
    const r = review("a", "agent-a", "2026-11-20T10:00:00Z", []);
    r.findings = [
      finding({ id: "open" }),
      finding({ id: "acc", accepted_at: "2026-11-21T00:00:00Z" }),
      finding({ id: "dis", dismissed_at: "2026-11-21T00:00:00Z" }),
    ];
    expect(ids(selectLatestFindings([r]))).toEqual(["acc", "dis", "open"]);
  });

  it("no reviews → []", () => {
    expect(selectLatestFindings([])).toEqual([]);
  });
});
