import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { IntlWrapper, testMessages } from "@/test/intl";
import { makeConvention } from "@/test/conventions";
import { makeSkill } from "@/test/skills";

const createSkill = vi.fn();
const attach = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createSkill, isPending: false }),
  useSkillTags: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useAttachConventions: () => ({ mutateAsync: attach, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: toastError }) }));

import { ConventionSkillModal } from "./ConventionSkillModal";

afterEach(cleanup);
beforeEach(() => {
  createSkill.mockReset();
  attach.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
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
    const user = userEvent.setup();
    createSkill.mockResolvedValueOnce(makeSkill({ id: "sk9", name: "payments-api-conventions" }));
    attach.mockResolvedValueOnce({ attached: 2 });
    const { onClose, save } = renderModal();
    const name = screen.getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "house-rules");
    await user.click(save());
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
    const user = userEvent.setup();
    createSkill.mockResolvedValueOnce(makeSkill({ id: "sk9" }));
    attach.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ attached: 2 });
    const { onClose, save } = renderModal();
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(testMessages.conventions.modal.attachFailed);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(2);
  });

  it("builds a skill from a subset: body, evidence files and attach follow the selection", async () => {
    const user = userEvent.setup();
    createSkill.mockResolvedValueOnce(makeSkill({ id: "sk1" }));
    attach.mockResolvedValueOnce({ attached: 1 });
    const { onClose, save } = renderModal();
    expect(screen.getByText("2 of 2 selected", { exact: false })).toBeInTheDocument();
    await user.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByText("1 of 2 selected", { exact: false })).toBeInTheDocument();
    const body = (screen.getByLabelText(/^Skill body/) as HTMLTextAreaElement).value;
    expect(body).not.toContain("Relative imports carry the .js suffix");
    expect(body).toContain("- Handlers call one service method");

    await user.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createSkill).toHaveBeenCalledWith(expect.objectContaining({ evidence_files: ["src/routes.ts"] }));
    expect(attach).toHaveBeenCalledWith({ skill_id: "sk1", ids: ["c2"] });
  });

  it("keeps a hand-edited body when the selection changes until Rebuild; Save needs a selection", async () => {
    const user = userEvent.setup();
    const { save } = renderModal();
    const bodyBox = () => screen.getByLabelText(/^Skill body/) as HTMLTextAreaElement;
    await user.clear(bodyBox());
    await user.type(bodyBox(), "my own text");
    await user.click(screen.getAllByRole("checkbox")[0]!);
    expect(bodyBox().value).toBe("my own text");
    await user.click(screen.getByRole("button", { name: "Rebuild body from selection" }));
    expect(bodyBox().value).toContain("- Handlers call one service method");
    expect(bodyBox().value).not.toContain("Relative imports");

    await user.click(screen.getAllByRole("checkbox")[1]!);
    expect(screen.getByText(testMessages.conventions.modal.noneSelected)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("maps a 409 to the name field", async () => {
    const user = userEvent.setup();
    createSkill.mockRejectedValueOnce(new ApiError("taken", 409));
    const { save } = renderModal();
    await user.click(save());
    expect(await screen.findByText(testMessages.validation.nameTaken)).toBeInTheDocument();
    expect(attach).not.toHaveBeenCalled();
  });

  it("shows a toast for a failure other than a name clash and does not attach", async () => {
    const user = userEvent.setup();
    createSkill.mockRejectedValueOnce(new ApiError("Server exploded", 500));
    const { onClose, save } = renderModal();
    await user.click(save());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Server exploded"));
    expect(attach).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
