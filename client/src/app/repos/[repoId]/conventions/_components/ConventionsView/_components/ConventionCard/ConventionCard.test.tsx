import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
  it("shows the rule with its evidence path and snippet", () => {
    renderCard();
    expect(screen.getByText("Relative imports carry the .js suffix")).toBeInTheDocument();
    expect(screen.getByText("src/service.ts")).toBeInTheDocument();
    expect(screen.getByText("import { repo } from './repository.js';")).toBeInTheDocument();
  });

  it("accepts and rejects a pending convention", () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onPatch).toHaveBeenCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onPatch).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("edits the rule inline and sends only a changed, non-empty text", async () => {
    const onPatch = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Rule");
    fireEvent.change(box, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(box, { target: { value: "  Use .js in relative imports " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
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
