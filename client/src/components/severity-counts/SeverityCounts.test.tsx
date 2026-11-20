import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { finding } from "@/test/findings";
import { SeverityCounts } from "./SeverityCounts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const FINDINGS = [
  finding({ id: "s1", severity: "SUGGESTION", title: "Rename var" }),
  finding({ id: "c1", severity: "CRITICAL", title: "Leaked key", file: "src/config.ts", start_line: 12, end_line: 12 }),
  finding({ id: "w1", severity: "WARNING", title: "Missing header" }),
  finding({ id: "w2", severity: "WARNING", title: "N+1 query" }),
  finding({ id: "d1", severity: "CRITICAL", title: "Dismissed one", dismissed_at: "2026-11-20T00:00:00Z" }),
];

describe("SeverityCounts", () => {
  it("renders one counter per non-zero level", () => {
    renderIntl(<SeverityCounts counts={{ critical: 3, warning: 0, suggestion: 2 }} />);
    expect(screen.getByLabelText("Findings: 3 Critical, 0 Warning, 2 Suggestion")).toBeInTheDocument();
    expect(document.querySelector('[data-severity="WARNING"]')).toBeNull();
    expect(document.querySelector('[data-severity="CRITICAL"]')).toHaveTextContent("3");
  });

  it("opens a popover with the 3 most severe live findings on hover", () => {
    renderIntl(<SeverityCounts counts={{ critical: 1, warning: 2, suggestion: 1 }} popover findings={FINDINGS} />);
    fireEvent.mouseEnter(screen.getByLabelText(/^Findings:/));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("4 findings in this run");
    expect(tip).toHaveTextContent("Leaked key");
    expect(tip).toHaveTextContent("src/config.ts:12");
    expect(tip).toHaveTextContent("+1 more");
    expect(tip).not.toHaveTextContent("Rename var"); // lowest severity is cut
    expect(tip).not.toHaveTextContent("Dismissed one");
  });

  it("closes on mouse leave after a short grace period", () => {
    vi.useFakeTimers();
    renderIntl(<SeverityCounts counts={{ critical: 1, warning: 0, suggestion: 0 }} popover findings={FINDINGS} />);
    const trigger = screen.getByLabelText(/^Findings:/);
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("has no popover unless asked", () => {
    renderIntl(<SeverityCounts counts={{ critical: 1, warning: 0, suggestion: 0 }} findings={FINDINGS} />);
    fireEvent.mouseEnter(screen.getByLabelText(/^Findings:/));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
