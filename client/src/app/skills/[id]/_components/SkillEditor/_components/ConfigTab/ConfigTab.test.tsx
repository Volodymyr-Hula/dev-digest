import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
  it("shows the token estimate and marks an edited body unsaved", () => {
    renderTab();
    expect(screen.getByTestId("skill-token-count")).toHaveTextContent("~2 tokens");
    expect(screen.queryByText("unsaved")).toBeNull();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "abcdefghi" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByTestId("skill-token-count")).toHaveTextContent("~3 tokens");
  });

  it("normalizes added tags and saves the full patch", () => {
    renderTab();
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "  OWASP " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "owasp," } });
    expect(screen.getAllByText("#owasp")).toHaveLength(1);

    fireEvent.click(screen.getByRole("checkbox", { name: "Trusted" }));
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toMatchObject({
      id: "sk1",
      patch: { tags: ["quality", "owasp"], trusted: false, body: "abcdefgh" },
    });
  });

  it("shows the name error only after blur and blocks the save", () => {
    renderTab();
    const nameInput = screen.getByDisplayValue("pr-quality-rubric");
    fireEvent.change(nameInput, { target: { value: "Bad Name" } });
    expect(screen.queryByText(testMessages.validation.skillNameFormat)).toBeNull();
    fireEvent.blur(nameInput);
    expect(screen.getByText(testMessages.validation.skillNameFormat)).toBeInTheDocument();
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("sizes the body textarea to all of its lines (long skills are not clipped)", () => {
    renderTab();
    const body = screen.getByLabelText("Skill body");
    const long = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n");
    fireEvent.change(body, { target: { value: long } });
    // 300 lines × 20px + 2×10px padding + 16px scrollbar room
    expect(body).toHaveStyle({ height: "6036px" });
  });
});
