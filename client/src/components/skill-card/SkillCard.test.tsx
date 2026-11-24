import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlWrapper } from "@/test/intl";
import { makeSkill } from "@/test/skills";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SkillCard } from "./SkillCard";

afterEach(cleanup);
beforeEach(() => push.mockReset());

const HREF = "/skills/sk1?tab=config";

function renderCard(ui: React.ReactElement) {
  return render(<IntlWrapper>{ui}</IntlWrapper>);
}

describe("SkillCard", () => {
  it("shows name, type, tags, trusted mark and agent count", () => {
    renderCard(<SkillCard skill={makeSkill({ tags: ["quality", "pr"] })} href={HREF} />);
    expect(screen.getByRole("link", { name: "pr-quality-rubric" })).toHaveAttribute("href", HREF);
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("#quality")).toBeInTheDocument();
    expect(screen.getByText("#pr")).toBeInTheDocument();
    expect(screen.getByLabelText("Trusted")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });

  it("marks an untrusted skill instead of the trusted check", () => {
    renderCard(<SkillCard skill={makeSkill({ trusted: false, agent_count: 1 })} href={HREF} />);
    expect(screen.queryByLabelText("Trusted")).toBeNull();
    expect(screen.getByText("untrusted source")).toBeInTheDocument();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
  });

  it("opens the skill on a click elsewhere on the card, but not on the toggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderCard(<SkillCard skill={makeSkill()} href={HREF} onToggle={onToggle} />);
    await user.click(screen.getByText("3 agents"));
    expect(push).toHaveBeenCalledWith(HREF);
    push.mockReset();
    await user.click(screen.getByRole("switch", { name: "Enable pr-quality-rubric" }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(push).not.toHaveBeenCalled();
  });
});
