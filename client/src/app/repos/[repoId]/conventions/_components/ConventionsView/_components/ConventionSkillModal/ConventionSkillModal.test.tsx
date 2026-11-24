import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IntlWrapper, testMessages } from "@/test/intl";
import { makeConvention } from "@/test/conventions";
import { makeSkill } from "@/test/skills";

const createSkill = vi.fn();
const attach = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createSkill, isPending: false }),
  useSkillTags: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useAttachConventions: () => ({ mutateAsync: attach, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: vi.fn() }) }));

import { ConventionSkillModal } from "./ConventionSkillModal";

afterEach(cleanup);
beforeEach(() => {
  createSkill.mockReset();
  attach.mockReset();
  toastSuccess.mockReset();
});

const conventions = [
  makeConvention({ id: "c1", status: "accepted" }),
  makeConvention({
    id: "c2",
    status: "accepted",
    rule: "Handlers call one service method",
    evidence_path: "src/routes.ts",
    evidence_snippet: "return service.list(req);",
  }),
];

function renderModal(onClose = vi.fn()) {
  render(
    <IntlWrapper>
      <ConventionSkillModal repoId="r1" repoName="acme/payments-api" conventions={conventions} onClose={onClose} />
    </IntlWrapper>,
  );
  return { onClose, save: () => screen.getByRole("button", { name: "Save skill" }) };
}

describe("ConventionSkillModal", () => {
  it("prefills name, description and a body with every rule and its full snippet; type is fixed", () => {
    renderModal();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("payments-api-conventions");
    expect(screen.getByLabelText(/^Description/)).toHaveValue("House conventions extracted from acme/payments-api.");
    const body = (screen.getByLabelText(/^Skill body/) as HTMLTextAreaElement).value;
    expect(body).toContain("- Relative imports carry the .js suffix");
    expect(body).toContain("Evidence: `src/routes.ts`");
    expect(body).toContain("  return service.list(req);");
    expect(screen.queryByLabelText(/^Type/)).toBeNull();
  });

  it("saves an extracted convention skill with evidence files, then marks the conventions", async () => {
    createSkill.mockResolvedValueOnce(makeSkill({ id: "sk9", name: "payments-api-conventions" }));
    attach.mockResolvedValueOnce({ attached: 2 });
    const { onClose, save } = renderModal();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "house-rules" } });
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "house-rules",
        type: "convention",
        source: "extracted",
        evidence_files: ["src/service.ts", "src/routes.ts"],
      }),
    );
    expect(attach).toHaveBeenCalledWith({ skill_id: "sk9", ids: ["c1", "c2"] });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("when marking fails, shows it and retries only the attach", async () => {
    createSkill.mockResolvedValueOnce(makeSkill({ id: "sk9" }));
    attach.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ attached: 2 });
    const { onClose, save } = renderModal();
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(testMessages.conventions.modal.attachFailed);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(2);
  });

  it("maps a 409 to the name field", async () => {
    const { ApiError } = await import("@/lib/api");
    createSkill.mockRejectedValueOnce(new ApiError("taken", 409));
    const { save } = renderModal();
    fireEvent.click(save());
    expect(await screen.findByText(testMessages.validation.nameTaken)).toBeInTheDocument();
    expect(attach).not.toHaveBeenCalled();
  });
});
