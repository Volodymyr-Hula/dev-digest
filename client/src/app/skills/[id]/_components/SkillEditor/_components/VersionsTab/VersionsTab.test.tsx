import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SkillVersion } from "@devdigest/shared";
import { IntlWrapper } from "@/test/intl";
import { ToastProvider } from "@/lib/toast";
import { makeSkill } from "@/test/skills";

const mutate = vi.fn();
const snap = (version: number, body: string): SkillVersion => ({
  skill_id: "sk1",
  version,
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  tags: [],
  trusted: true,
  body,
  created_at: "2026-11-24T10:00:00Z",
});
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: [snap(3, "## Three"), snap(2, "two"), snap(1, "one")], isLoading: false, isError: false }),
  useActivateSkillVersion: () => ({ mutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);
beforeEach(() => mutate.mockReset());

function renderTab() {
  render(
    <IntlWrapper>
      <ToastProvider>
        <VersionsTab skill={makeSkill({ version: 2 })} />
      </ToastProvider>
    </IntlWrapper>,
  );
}

describe("skill VersionsTab", () => {
  it("opens on the active version, marks active and latest, and hides Make active for it", () => {
    renderTab();
    const [v3, v2] = screen.getAllByRole("listitem");
    expect(within(v3!).getByText("latest")).toBeInTheDocument();
    expect(within(v2!).getByText("active")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "v2" })).toHaveTextContent("two");
    expect(screen.queryByRole("button", { name: "Make active" })).toBeNull();
  });

  it("renders a selected version's body as markdown and activates it after confirm", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderTab();
    await user.click(screen.getByText("v3"));
    expect(screen.getByRole("heading", { level: 2, name: "Three" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make active" }));
    expect(mutate.mock.calls[0]![0]).toEqual({ id: "sk1", version: 3 });
  });
});
