import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlWrapper, testMessages } from "@/test/intl";
import { ToastProvider } from "@/lib/toast";
import { makeSkill } from "@/test/skills";

const mutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillTags: () => ({ data: ["owasp"] }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ConfigTab } from "./ConfigTab";

afterEach(cleanup);
beforeEach(() => mutate.mockReset());

function renderTab() {
  return render(
    <IntlWrapper>
      <ToastProvider>
        <ConfigTab skill={makeSkill({ body: "abcdefgh" })} />
      </ToastProvider>
    </IntlWrapper>,
  );
}

describe("skill ConfigTab", () => {
  it("shows the token estimate and marks an edited body unsaved", async () => {
    const user = userEvent.setup();
    renderTab();
    expect(screen.getByText("~2 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).toBeNull();
    await user.type(screen.getByLabelText("Skill body"), "i");
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("~3 tokens")).toBeInTheDocument();
  });

  it("normalizes added tags and saves the full patch", async () => {
    const user = userEvent.setup();
    renderTab();
    const input = screen.getByLabelText("Tags");
    await user.type(input, "  OWASP {Enter}");
    await user.type(input, "owasp,");
    expect(screen.getAllByText("#owasp")).toHaveLength(1);

    await user.click(screen.getByRole("checkbox", { name: "Trusted" }));
    await user.click(screen.getByText("Save skill"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toMatchObject({
      id: "sk1",
      patch: { tags: ["quality", "owasp"], trusted: false, body: "abcdefgh" },
    });
  });

  it("shows the name error only after blur and blocks the save", async () => {
    const user = userEvent.setup();
    renderTab();
    const nameInput = screen.getByDisplayValue("pr-quality-rubric");
    await user.clear(nameInput);
    await user.type(nameInput, "Bad Name");
    expect(screen.queryByText(testMessages.validation.skillNameFormat)).toBeNull();
    await user.tab();
    expect(screen.getByText(testMessages.validation.skillNameFormat)).toBeInTheDocument();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByText("Save skill"));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("sizes the body textarea to all of its lines (long skills are not clipped)", async () => {
    const user = userEvent.setup();
    renderTab();
    const body = screen.getByLabelText("Skill body");
    const long = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n");
    await user.clear(body);
    await user.click(body);
    await user.paste(long);
    // 300 lines × 20px + 2×10px padding + 16px scrollbar room
    expect(body).toHaveStyle({ height: "6036px" });
  });
});
