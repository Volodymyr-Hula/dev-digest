import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
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
  it("validates the name on blur, not while typing, and clears the error once fixed", () => {
    const { name } = renderModal();
    fireEvent.change(name, { target: { value: "Security audit" } });
    expect(screen.queryByText(v.skillNameFormat)).toBeNull();
    fireEvent.blur(name);
    expect(screen.getByText(v.skillNameFormat)).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(name, { target: { value: "security-audit" } });
    expect(screen.queryByText(v.skillNameFormat)).toBeNull();
  });

  it("keeps Create enabled; clicking it shows every error and focuses the first", () => {
    const { name, create } = renderModal();
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(screen.getAllByText(v.required)).toHaveLength(2);
    expect(document.activeElement).toBe(name);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("sends tags and maps a 409 to the name field", async () => {
    const { ApiError } = await import("@/lib/api");
    mutateAsync.mockRejectedValueOnce(new ApiError("taken", 409));
    const { name, create } = renderModal();
    fireEvent.change(name, { target: { value: "security-audit" } });
    const tags = screen.getByLabelText(/^Tags/);
    fireEvent.change(tags, { target: { value: "secu" } });
    fireEvent.keyDown(tags, { key: "Enter" });
    fireEvent.change(screen.getByLabelText(/^Skill body/), { target: { value: "# Rule" } });
    fireEvent.click(create);
    await waitFor(() => expect(screen.getByText(v.nameTaken)).toBeInTheDocument());
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ name: "security-audit", tags: ["security"], body: "# Rule" });
  });
});
