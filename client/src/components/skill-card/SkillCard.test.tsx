import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlWrapper } from "@/test/intl";
import { makeSkill } from "@/test/skills";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

function renderCard(ui: React.ReactElement) {
  return render(
    <IntlWrapper>{ui}</IntlWrapper>,
  );
}

describe("SkillCard", () => {
  it("shows name, type, tags, trusted mark and agent count", () => {
    renderCard(<SkillCard skill={makeSkill({ tags: ["quality", "pr"] })} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("#quality")).toBeInTheDocument();
    expect(screen.getByText("#pr")).toBeInTheDocument();
    expect(screen.getByLabelText("Trusted")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });

  it("marks an untrusted skill instead of the trusted check", () => {
    renderCard(<SkillCard skill={makeSkill({ trusted: false, agent_count: 1 })} />);
    expect(screen.queryByLabelText("Trusted")).toBeNull();
    expect(screen.getByText("untrusted source")).toBeInTheDocument();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
  });

  it("calls onClick for the card", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderCard(<SkillCard skill={makeSkill()} onClick={onClick} />);
    await user.click(screen.getByTestId("skill-card"));
    expect(onClick).toHaveBeenCalled();
  });
});
