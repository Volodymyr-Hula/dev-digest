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

const chips = () =>
  screen.getByRole("group", { name: "Show only" }).querySelectorAll("button");

describe("FindingsTab severity filter", () => {
  it("counts live findings across every run", () => {
    renderTab();
    const [crit, warn, sugg] = Array.from(chips());
    expect(crit).toHaveTextContent("1 CRITICAL");
    expect(warn).toHaveTextContent("1 WARNING");
    expect(sugg).toHaveTextContent("1 SUGGESTION");
  });

  it("clicking a level shows only its findings and hides runs without any; clicking again resets", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /1 SUGGESTION/ }));
    expect(screen.getByText("Memoize list")).toBeInTheDocument();
    expect(screen.queryAllByText("Security Reviewer")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /1 CRITICAL/ }));
    expect(screen.getByText("Leaked key")).toBeInTheDocument();
    expect(screen.queryByText("Missing header")).not.toBeInTheDocument();
    expect(screen.queryByText("Old crit")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Performance Reviewer")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /1 CRITICAL/ }));
    expect(screen.getAllByText("Security Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Performance Reviewer").length).toBeGreaterThan(0);
  });

  it("the Show all button clears the filter", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /1 WARNING/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getAllByText("Performance Reviewer").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
  });
});
