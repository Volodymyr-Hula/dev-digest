import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { finding } from "@/test/findings";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsTab } from "./FindingsTab";

afterEach(cleanup);

function review(id: string, agent: string, findings: ReviewRecord["findings"]): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: `a-${id}`,
    run_id: `run-${id}`,
    agent_name: agent,
    kind: "review",
    verdict: "comment",
    summary: "s",
    score: 60,
    model: "m",
    created_at: "2026-11-20T00:00:00Z",
    findings,
  } as ReviewRecord;
}

const RUNS = [
  review("sec", "Security Reviewer", [
    finding({ id: "c1", severity: "CRITICAL", title: "Leaked key" }),
    finding({ id: "c2", severity: "CRITICAL", title: "Old crit", dismissed_at: "2026-11-20T00:00:00Z" }),
    finding({ id: "w1", severity: "WARNING", title: "Missing header" }),
  ]),
  review("perf", "Performance Reviewer", [
    finding({ id: "s1", severity: "SUGGESTION", title: "Memoize list" }),
  ]),
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={RUNS}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={{ mutate: vi.fn(), isPending: false } as never}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("FindingsTab severity counters", () => {
  it("each run card has its own counters, scoped to that card", () => {
    renderTab();
    // Only the first (default-open) card renders its panel.
    const rows = screen.getAllByTestId("severity-counts");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("2 CRITICAL·1 WARNING"); // dismissed card is listed, so counted
    expect(rows[0]).not.toHaveTextContent("SUGGESTION"); // the other run's suggestion is not counted
    expect(screen.getAllByRole("group", { name: "Show only" })).toHaveLength(1);
  });
});
