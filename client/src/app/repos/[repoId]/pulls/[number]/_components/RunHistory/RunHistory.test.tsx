/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { finding } from "@/test/findings";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: Map<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} findingsByRun={findingsByRun} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — severity counters", () => {
  it("shows live per-severity counts from the run's review", () => {
    const f = [
      finding({ id: "c1", severity: "CRITICAL" }),
      finding({ id: "c2", severity: "CRITICAL" }),
      finding({ id: "w1", severity: "WARNING", dismissed_at: "2026-11-20T00:00:00Z" }),
      finding({ id: "s1", severity: "SUGGESTION" }),
    ];
    renderRuns(
      [run({ status: "done", findings_count: 4, blockers: 2, score: 38 })],
      new Map([["run-1", f]]),
    );
    expect(screen.getByLabelText("Findings: 2 Critical, 0 Warning, 1 Suggestion")).toBeInTheDocument();
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("falls back to the text count when the run has no review", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })], new Map());
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost", () => {
  it("a settled run tile shows its cost and token flow", () => {
    renderRuns([run({ status: "done", cost_usd: 0.0123, tokens_in: 8200, tokens_out: 1240 })]);
    expect(screen.getByTestId("timeline-run-cost")).toHaveTextContent("$0.012 · 8.2K→1.2K");
  });

  it("a failed run tile shows no cost", () => {
    renderRuns([run({ status: "failed", error: "boom" })]);
    expect(screen.queryByTestId("timeline-run-cost")).not.toBeInTheDocument();
  });
});
