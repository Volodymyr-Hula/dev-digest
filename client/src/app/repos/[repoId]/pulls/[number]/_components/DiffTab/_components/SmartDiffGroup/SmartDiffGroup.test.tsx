import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlWrapper } from "@/test/intl";
import type { PrFile } from "@/lib/types";
import { SmartDiffGroup } from "./SmartDiffGroup";

/** Spec: specs/smart-diff.md FR-017, FR-018, FR-019, FR-021, T-014. */

afterEach(cleanup);

const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n a\n+b" },
  { path: "src/b.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n a\n+b" },
];

function renderGroup(over: { findingFileCount?: number; defaultOpen?: boolean } = {}) {
  return render(
    <IntlWrapper>
      <SmartDiffGroup
        label="Core"
        description="The substance of the change"
        color="var(--accent)"
        files={FILES}
        findingFileCount={over.findingFileCount ?? 0}
        defaultOpen={over.defaultOpen ?? true}
      />
    </IntlWrapper>,
  );
}

describe("SmartDiffGroup", () => {
  it("header shows label, description and file count; clicking toggles aria-expanded and the files", async () => {
    const user = userEvent.setup();
    renderGroup({ defaultOpen: false });

    const header = screen.getByRole("button", { name: /Core/ });
    expect(header).toHaveTextContent("The substance of the change");
    expect(header).toHaveTextContent("2 files");
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
  });

  it("shows '● N' only when N > 0", () => {
    const { unmount } = renderGroup({ findingFileCount: 0 });
    expect(screen.queryByTestId("group-finding-count")).not.toBeInTheDocument();
    unmount();

    renderGroup({ findingFileCount: 3 });
    expect(screen.getByTestId("group-finding-count")).toHaveTextContent("● 3");
  });

  it("the header is sticky so it stays at the top while its files scroll", () => {
    renderGroup();
    expect(screen.getByRole("button", { name: /Core/ })).toHaveStyle({ position: "sticky", top: "0px" });
  });
});
