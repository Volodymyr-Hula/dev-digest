import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { makeSkill } from "@/test/skills";

const mutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [
      makeSkill({ id: "b", name: "secret-gate", type: "security" }),
      makeSkill({ id: "a", name: "no-then-chains", type: "convention", enabled: false }),
      makeSkill({ id: "c", name: "pr-quality-rubric" }),
    ],
  }),
  useAgentSkills: () => ({ data: [{ agent_id: "ag1", skill_id: "b", order: 0 }] }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);
beforeEach(() => mutate.mockReset());

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("agent SkillsTab", () => {
  it("lists every skill by name with linked ones checked", () => {
    renderTab();
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
    const names = screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent);
    expect(names).toEqual(["no-then-chains", "pr-quality-rubric", "secret-gate"]);
    expect(screen.getByRole("checkbox", { name: "secret-gate" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
  });

  it("links and unlinks via the full id set", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "pr-quality-rubric" }));
    expect(mutate).toHaveBeenLastCalledWith({ agentId: "ag1", skillIds: ["b", "c"] });
    fireEvent.click(screen.getByRole("checkbox", { name: "secret-gate" }));
    expect(mutate).toHaveBeenLastCalledWith({ agentId: "ag1", skillIds: [] });
  });

  it("filters by name", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "secret" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });
});
