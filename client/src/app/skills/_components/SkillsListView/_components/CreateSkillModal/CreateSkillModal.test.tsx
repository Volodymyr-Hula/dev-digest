import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { IntlWrapper, testMessages } from "@/test/intl";

const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false }),
  useSkillTags: () => ({ data: ["security"] }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(cleanup);
beforeEach(() => {
  mutateAsync.mockReset();
  push.mockReset();
});

const v = testMessages.validation;

function renderModal() {
  render(
    <IntlWrapper>
      <CreateSkillModal onClose={vi.fn()} />
    </IntlWrapper>,
  );
  return { name: screen.getByLabelText(/^Name/), create: screen.getByRole("button", { name: "Create skill" }) };
}

describe("CreateSkillModal", () => {
  it("validates the name on blur, not while typing, and clears the error once fixed", async () => {
    const user = userEvent.setup();
    const { name } = renderModal();
    await user.type(name, "Security audit");
    expect(screen.queryByText(v.skillNameFormat)).toBeNull();
    await user.tab();
    expect(screen.getByText(v.skillNameFormat)).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    await user.clear(name);
    await user.type(name, "security-audit");
    expect(screen.queryByText(v.skillNameFormat)).toBeNull();
  });

  it("keeps Create enabled; clicking it shows every error and focuses the first", async () => {
    const user = userEvent.setup();
    const { name, create } = renderModal();
    expect(create).toBeEnabled();
    await user.click(create);
    expect(screen.getAllByText(v.required)).toHaveLength(2);
    expect(document.activeElement).toBe(name);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("sends tags and maps a 409 to the name field", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new ApiError("taken", 409));
    const { name, create } = renderModal();
    await user.type(name, "security-audit");
    const tags = screen.getByLabelText(/^Tags/);
    await user.type(tags, "secu{Enter}");
    await user.type(screen.getByLabelText(/^Skill body/), "# Rule");
    await user.click(create);
    await waitFor(() => expect(screen.getByText(v.nameTaken)).toBeInTheDocument());
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ name: "security-audit", tags: ["security"], body: "# Rule" });
  });

  it("on a failure other than a name clash stays open with no field error (the global handler toasts it)", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new ApiError("Server exploded", 500));
    const { name, create } = renderModal();
    await user.type(name, "ok-name");
    await user.type(screen.getByLabelText(/^Skill body/), "# x");
    await user.click(create);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(v.nameTaken)).toBeNull();
  });
});
