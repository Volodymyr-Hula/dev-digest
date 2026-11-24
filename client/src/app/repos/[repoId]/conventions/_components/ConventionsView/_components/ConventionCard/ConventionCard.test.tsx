import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlWrapper } from "@/test/intl";
import { makeConvention } from "@/test/conventions";
import type { ConventionCandidate } from "@devdigest/shared";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

function renderCard(over: Partial<ConventionCandidate> = {}) {
  const onPatch = vi.fn();
  render(
    <IntlWrapper>
      <ConventionCard c={makeConvention(over)} onPatch={onPatch} />
    </IntlWrapper>,
  );
  return onPatch;
}

describe("ConventionCard", () => {
  it("shows the rule with its evidence path and snippet; the path links to the lines on GitHub", () => {
    renderCard();
    expect(screen.getByText("Relative imports carry the .js suffix")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/service.ts:1" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/deadbeef/src/service.ts#L1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("import { repo } from './repository.js';")).toBeInTheDocument();
  });

  it("shows a line range, and plain text when there is no link", () => {
    renderCard({ evidence_lines: { start: 3, end: 7 }, evidence_url: null });
    expect(screen.getByText("src/service.ts:3-7")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("accepts and rejects a pending convention", async () => {
    const user = userEvent.setup();
    const onPatch = renderCard();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onPatch).toHaveBeenCalledWith({ status: "accepted" });
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onPatch).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("edits the rule inline and sends only a changed, non-empty text", async () => {
    const user = userEvent.setup();
    const onPatch = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Rule");
    await user.clear(box);
    await user.type(box, "   ");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(box);
    await user.type(box, "  Use .js in relative imports ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onPatch).toHaveBeenCalledWith({ rule: "Use .js in relative imports" });
  });

  it("offers only Accept on a rejected convention", () => {
    renderCard({ status: "rejected" });
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("is read-only once part of a skill", () => {
    renderCard({ status: "accepted", skill_id: "sk1" });
    expect(screen.getByText("In skill")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
