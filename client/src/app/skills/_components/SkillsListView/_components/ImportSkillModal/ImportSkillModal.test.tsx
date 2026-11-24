import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SkillImportPreview } from "@devdigest/shared";
import { IntlWrapper, testMessages } from "@/test/intl";
import { ToastProvider } from "@/lib/toast";

const previewAsync = vi.fn();
const createAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createAsync, isPending: false }),
  useSkillTags: () => ({ data: [] }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(cleanup);
beforeEach(() => {
  previewAsync.mockReset();
  createAsync.mockReset();
  push.mockReset();
});

const PREVIEW: SkillImportPreview = {
  draft: {
    name: "sec-audit",
    description: "Audit auth",
    type: "custom",
    tags: ["owasp"],
    body: "## Check\n- tokens",
    source: "imported_file",
  },
  warnings: ['Unknown type "linter" — set to "custom".'],
  ignored_files: ["sec-audit/scripts/run.sh"],
  name_taken: true,
};

function renderModal(mode: "file" | "url") {
  render(
    <IntlWrapper>
      <ToastProvider>
        <ImportSkillModal mode={mode} onClose={vi.fn()} />
      </ToastProvider>
    </IntlWrapper>,
  );
}

describe("ImportSkillModal", () => {
  it("validates the URL on blur and sends nothing while it is invalid", async () => {
    const user = userEvent.setup();
    renderModal("url");
    const url = screen.getByLabelText(/^Skill URL/);
    await user.type(url, "http://x.tld/a.md");
    await user.tab();
    expect(screen.getByText(testMessages.validation.httpsUrl)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(previewAsync).not.toHaveBeenCalled();
  });

  it("previews a file without saving, flags the taken name, then imports the edited draft", async () => {
    const user = userEvent.setup({ applyAccept: false });
    previewAsync.mockResolvedValueOnce(PREVIEW);
    createAsync.mockResolvedValueOnce({ id: "sk9", name: "sec-audit-2" });
    renderModal("file");
    const input = screen.getByLabelText(/^Skill file/) as HTMLInputElement;
    const f = new File(["---\nname: a\n---\nx"], "SKILL.md", { type: "text/markdown" });
    await user.upload(input, f);
    await user.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => expect(screen.getByTestId("import-body-preview")).toBeInTheDocument());
    expect(previewAsync.mock.calls[0]![0]).toMatchObject({ kind: "file", filename: "SKILL.md" });
    expect(createAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 2, name: "Check" })).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.warnings[0]!)).toBeInTheDocument();
    expect(screen.getByText("sec-audit/scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText(testMessages.validation.nameTaken)).toBeInTheDocument();

    const nameField = screen.getByDisplayValue("sec-audit");
    await user.clear(nameField);
    await user.type(nameField, "sec-audit-2");
    expect(screen.queryByText(testMessages.validation.nameTaken)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Import skill" }));
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(1));
    const sent = createAsync.mock.calls[0]![0];
    expect(sent).toMatchObject({ name: "sec-audit-2", source: "imported_file", tags: ["owasp"] });
    expect(sent).not.toHaveProperty("trusted");
    expect(push).toHaveBeenCalledWith("/skills/sk9?tab=preview");
  });

  it("rejects an unsupported file type before calling the server", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderModal("file");
    const input = screen.getByLabelText(/^Skill file/);
    await user.upload(input, new File(["x"], "run.sh"));
    expect(screen.getByText(testMessages.skills.import.fileType)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(previewAsync).not.toHaveBeenCalled();
  });

  it("shows a generic preview failure when the request rejects with a non-API error", async () => {
    const user = userEvent.setup();
    previewAsync.mockRejectedValueOnce(new Error("network"));
    renderModal("url");
    await user.type(screen.getByLabelText(/^Skill URL/), "https://x.tld/a.md");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(testMessages.skills.import.previewFailed)).toBeInTheDocument();
  });
});
