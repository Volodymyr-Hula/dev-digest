import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import type { PrMeta } from "@/lib/types";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const usePrReviews = vi.fn((_prId: string | null) => ({ data: undefined as unknown }));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: (id: string | null) => usePrReviews(id) }));

afterEach(cleanup);

const PR: PrMeta = {
  id: "p1",
  number: 482,
  title: "Add rate limiting",
  author: "marisa.koch",
  branch: "feat/rl",
  base: "main",
  head_sha: "a1b2c3d4",
  additions: 10,
  deletions: 2,
  files_count: 1,
  status: "reviewed",
  opened_at: null,
  updated_at: null,
};

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow cost cell", () => {
  it("shows the PR's total run cost compactly", () => {
    renderRow({ ...PR, score: 65, cost_usd: 0.0123 });
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("shows a dash, not $0.00, when cost is unknown", () => {
    renderRow({ ...PR, score: 65, cost_usd: null });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("PRRow findings cell", () => {
  it("shows per-severity counts, skipping zero levels", () => {
    renderRow({ ...PR, score: 61, severity_counts: { critical: 2, warning: 0, suggestion: 4 } });
    const cell = screen.getByLabelText(/^Findings:/);
    expect(cell.querySelector('[data-severity="CRITICAL"]')).toHaveTextContent("2");
    expect(cell.querySelector('[data-severity="SUGGESTION"]')).toHaveTextContent("4");
    expect(cell.querySelector('[data-severity="WARNING"]')).toBeNull();
  });

  it("shows a dash when the PR was never reviewed", () => {
    renderRow({ ...PR, score: null, severity_counts: null });
    expect(screen.queryByLabelText(/^Findings:/)).not.toBeInTheDocument();
  });

  it("fetches the review findings only once the popover opens", () => {
    usePrReviews.mockClear();
    renderRow({ ...PR, score: 61, severity_counts: { critical: 1, warning: 0, suggestion: 0 } });
    expect(usePrReviews).toHaveBeenLastCalledWith(null);
    fireEvent.mouseEnter(screen.getByLabelText(/^Findings:/));
    expect(usePrReviews).toHaveBeenLastCalledWith("p1");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Loading findings…");
  });
});
