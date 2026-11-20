import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { finding } from "@/test/findings";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters + filter", () => {
  const MIXED = [
    finding({ id: "c", severity: "CRITICAL", title: "Crit one" }),
    finding({ id: "w", severity: "WARNING", title: "Warn one" }),
    finding({ id: "wd", severity: "WARNING", title: "Warn dismissed", dismissed_at: "2026-11-20T00:00:00Z" }),
    finding({ id: "wl", severity: "WARNING", title: "Warn low", confidence: 0.3 }),
  ];
  const filter = (name: string) => screen.getByRole("button", { name });
  const row = () => screen.getByTestId("severity-counts");

  it("counts every card the list shows, dismissed included, listing only present levels", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(row()).toHaveTextContent("1 CRITICAL·3 WARNING");
    expect(row()).not.toHaveTextContent("SUGGESTION");
    expect(screen.getByText("Warn dismissed")).toBeInTheDocument();
  });

  it("always renders the three filter buttons", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(filter("Critical")).toBeInTheDocument();
    expect(filter("Warning")).toBeInTheDocument();
    expect(filter("Suggestion")).toBeInTheDocument();
  });

  it("filtering to a level shows exactly as many cards as its counter; a second click resets", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(filter("Warning"));
    expect(screen.getByText("Warn one")).toBeInTheDocument();
    expect(screen.getByText("Warn dismissed")).toBeInTheDocument();
    expect(screen.getByText("Warn low")).toBeInTheDocument();
    expect(screen.queryByText("Crit one")).not.toBeInTheDocument();

    fireEvent.click(filter("Warning"));
    expect(screen.getByText("Crit one")).toBeInTheDocument();

    fireEvent.click(filter("Critical"));
    expect(screen.queryByText("Warn one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("Warn one")).toBeInTheDocument();
  });

  it("hide low confidence lowers the counters along with the list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(row()).toHaveTextContent("2 WARNING");
    expect(screen.queryByText("Warn low")).not.toBeInTheDocument();
  });
});
