import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FindingRecord, PrReviewComment } from "@devdigest/shared";
import { IntlWrapper } from "@/test/intl";
import { finding } from "@/test/findings";
import type { PrFile } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import { FileCard } from "./FileCard";

/**
 * One file of the diff with agent findings (spec: specs/smart-diff.md
 * FR-020, FR-022..FR-025, FR-027..FR-030, T-014).
 */

afterEach(cleanup);

// new lines: 9 ctx, 10 ctx, 11 add, 12 add (a deleted old line sits between 10 and 11)
const CONFIG: PrFile = {
  path: "src/config.ts",
  additions: 2,
  deletions: 1,
  patch: [
    "@@ -9,3 +9,4 @@",
    " export const config = {",
    "   port: 3000,",
    "-  old: true,",
    "+  // limiter",
    "+  stripeKey: 'sk_live_x',",
  ].join("\n"),
};

const CRIT = finding({
  id: "f-crit",
  severity: "CRITICAL",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "A live key is committed in source.",
  suggestion: "Move it to an env var.",
});

function api(findings: FindingRecord[], over: Partial<DiffFindingApi> = {}): DiffFindingApi {
  return { findings, showFindings: true, onAction: vi.fn(), pendingId: null, repoFullName: null, headSha: null, ...over };
}

function renderFile(file: PrFile, findings?: DiffFindingApi, commenting?: DiffCommentApi) {
  return render(
    <IntlWrapper>
      <FileCard file={file} findings={findings} commenting={commenting} />
    </IntlWrapper>,
  );
}

/** The rendered row of a code line: the closest wrapper holding both its text and its card. */
const rowOf = (text: string) => screen.getByText(text).closest("div")!.parentElement as HTMLElement;

describe("FileCard — finding dot (FR-022)", () => {
  it("shows the dot only when the file has findings, and keeps it separate from the comment counter", () => {
    const comment: PrReviewComment = {
      id: 1,
      path: "src/config.ts",
      line: 11,
      original_line: 11,
      side: "RIGHT",
      body: "hm",
      user: "r",
      created_at: "2026-06-01T00:00:00Z",
      html_url: "https://github.com/acme/x/pull/7#discussion_r1",
      in_reply_to_id: null,
      is_outdated: false,
    };
    const commenting: DiffCommentApi = {
      comments: [comment],
      canComment: false,
      showComments: true,
      posting: false,
      onSubmit: vi.fn(),
    };

    // comments only → counter, no dot
    const first = renderFile(CONFIG, api([]), commenting);
    expect(screen.queryByTestId("file-finding-dot")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    first.unmount();

    // findings (of this file) + comments → both, as two different elements; the dot carries no number
    renderFile(CONFIG, api([CRIT, finding({ id: "other", file: "src/other.ts" })]), commenting);
    const dot = screen.getByTestId("file-finding-dot");
    expect(dot).toHaveAccessibleName("This file has findings");
    expect(dot).toHaveTextContent("");
    expect(screen.getByText("1")).not.toBe(dot);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("findings of another file do not light the dot", () => {
    renderFile(CONFIG, api([finding({ id: "x", file: "src/other.ts" })]));
    expect(screen.queryByTestId("file-finding-dot")).not.toBeInTheDocument();
  });

  it("keeps the dot when the toggle hides the cards", () => {
    renderFile(CONFIG, api([CRIT], { showFindings: false }));
    expect(screen.getByTestId("file-finding-dot")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
    expect(screen.queryByTestId("line-sev-label")).not.toBeInTheDocument();
  });
});

describe("FileCard — inline finding card (FR-023, FR-024, FR-025)", () => {
  it("renders the card under the line RIGHT:start_line with title, rationale, fix, actions and the severity label 'blocker' on the line", () => {
    renderFile(CONFIG, api([CRIT]));

    const row = rowOf("stripeKey: 'sk_live_x',");
    const card = within(row).getByText("Hardcoded Stripe secret key").closest("[data-finding-id]") as HTMLElement;
    expect(card).toHaveAttribute("data-finding-id", "f-crit");
    expect(within(card).getByText("A live key is committed in source.")).toBeInTheDocument();
    expect(within(card).getByText("Suggested fix")).toBeInTheDocument();
    expect(within(card).getByText("Move it to an env var.")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Reject" })).toBeInTheDocument();
    // the line itself carries the right-hand label, in the same row
    expect(within(row).getByTestId("line-sev-label")).toHaveTextContent("blocker");

    // the neighbouring line is untouched
    const other = rowOf("// limiter");
    expect(within(other).queryByTestId("line-sev-label")).not.toBeInTheDocument();
    expect(within(other).queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
  });

  it.each([
    ["CRITICAL", "blocker"],
    ["WARNING", "warning"],
    ["SUGGESTION", "suggestion"],
  ] as const)("a %s finding labels its line '%s'", (severity, label) => {
    renderFile(CONFIG, api([finding({ id: "s", severity, file: "src/config.ts", start_line: 11, end_line: 11 })]));
    expect(within(rowOf("// limiter")).getByTestId("line-sev-label")).toHaveTextContent(label);
  });

  it("several findings on one line all render there; the label uses the highest severity", () => {
    const warn = finding({ id: "w", severity: "WARNING", title: "Unvalidated limiter", file: "src/config.ts", start_line: 12, end_line: 12 });
    const sugg = finding({ id: "s", severity: "SUGGESTION", title: "Rename key", file: "src/config.ts", start_line: 12, end_line: 12 });
    renderFile(CONFIG, api([sugg, warn, CRIT]));

    const row = rowOf("stripeKey: 'sk_live_x',");
    for (const title of ["Hardcoded Stripe secret key", "Unvalidated limiter", "Rename key"]) {
      expect(within(row).getByText(title)).toBeInTheDocument();
    }
    expect(within(row).getAllByTestId("line-sev-label")).toHaveLength(1);
    expect(within(row).getByTestId("line-sev-label")).toHaveTextContent("blocker");
  });

  it("matches on the NEW side only: a finding on the number of a deleted line is not anchored there", () => {
    // old line 11 was deleted; new line 11 is the added '// limiter'. Findings key on RIGHT:11 → the added line.
    renderFile(CONFIG, api([finding({ id: "n", title: "On line 11", file: "src/config.ts", start_line: 11, end_line: 11 })]));
    expect(within(rowOf("// limiter")).getByText("On line 11")).toBeInTheDocument();
    expect(within(rowOf("old: true,")).queryByText("On line 11")).not.toBeInTheDocument();
  });

  it("a click on the card header collapses it to one line, a second click expands it again", async () => {
    const user = userEvent.setup();
    renderFile(CONFIG, api([CRIT]));

    expect(screen.getByText("A live key is committed in source.")).toBeInTheDocument();
    await user.click(screen.getByText("Hardcoded Stripe secret key"));
    expect(screen.queryByText("A live key is committed in source.")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    await user.click(screen.getByText("Hardcoded Stripe secret key"));
    expect(screen.getByText("A live key is committed in source.")).toBeInTheDocument();
  });

  it("Accept and Reject report the finding id and action", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderFile(CONFIG, api([CRIT], { onAction }));

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAction).toHaveBeenLastCalledWith("f-crit", "accept");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onAction).toHaveBeenLastCalledWith("f-crit", "dismiss");
  });

  it("an accepted or dismissed finding stays visible, marked, and still lights the dot (FR-027)", () => {
    const accepted = { ...CRIT, id: "a", title: "Accepted one", accepted_at: "2026-11-21T00:00:00Z" };
    const dismissed = { ...CRIT, id: "d", title: "Dismissed one", dismissed_at: "2026-11-21T00:00:00Z" };
    renderFile(CONFIG, api([accepted, dismissed]));

    expect(screen.getByText("Accepted one")).toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText("Dismissed one")).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.getByTestId("file-finding-dot")).toBeInTheDocument();
  });
});

describe("FileCard — unanchored findings (FR-029)", () => {
  it("a finding whose line is not in the patch shows in the end-of-file block, not inline", () => {
    const off = finding({ id: "off", title: "N+1 query", file: "src/config.ts", start_line: 45, end_line: 52 });
    renderFile(CONFIG, api([CRIT, off]));

    const block = screen.getByText("Findings outside the shown lines").parentElement as HTMLElement;
    expect(within(block).getByText("N+1 query")).toBeInTheDocument();
    expect(within(block).queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
    // the off-patch finding labels no line
    expect(screen.getAllByTestId("line-sev-label")).toHaveLength(1);
  });

  it("a file without a patch still shows all its findings in the block", () => {
    renderFile({ path: "src/config.ts", additions: 3, deletions: 0, patch: null }, api([CRIT]));
    const block = screen.getByText("Findings outside the shown lines").parentElement as HTMLElement;
    expect(within(block).getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });

  it("a finding whose start_line exists only as a deleted (LEFT) line goes to the end-of-file block, not under the deleted row (Edge cases)", () => {
    // old lines 5..8, new lines 5..6: old line 7 is deleted and there is no new line 7
    const shrink: PrFile = {
      path: "src/shrink.ts",
      additions: 0,
      deletions: 2,
      patch: ["@@ -5,4 +5,2 @@", " keepA", "-goneB", "-goneC", " keepD"].join("\n"),
    };
    const onDeleted = finding({ id: "del", title: "On a deleted line", file: "src/shrink.ts", start_line: 7, end_line: 7 });
    renderFile(shrink, api([onDeleted]));

    const block = screen.getByText("Findings outside the shown lines").parentElement as HTMLElement;
    expect(within(block).getByText("On a deleted line")).toBeInTheDocument();
    // rendered once, in the block only; the deleted row labels nothing
    expect(screen.getAllByText("On a deleted line")).toHaveLength(1);
    expect(within(rowOf("goneC")).queryByText("On a deleted line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("line-sev-label")).not.toBeInTheDocument();
    // the file still shows its dot
    expect(screen.getByTestId("file-finding-dot")).toBeInTheDocument();
  });

  it("the block follows the show/hide toggle", () => {
    const off = finding({ id: "off", title: "N+1 query", file: "src/config.ts", start_line: 45, end_line: 52 });
    renderFile(CONFIG, api([off], { showFindings: false }));
    expect(screen.queryByText("Findings outside the shown lines")).not.toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
  });

  it("no block when every finding is anchored", () => {
    renderFile(CONFIG, api([CRIT]));
    expect(screen.queryByText("Findings outside the shown lines")).not.toBeInTheDocument();
  });
});

describe("FileCard — auto-expand is unchanged (FR-020)", () => {
  const big = (n: number): PrFile => ({
    path: "src/big.ts",
    additions: n,
    deletions: 0,
    patch: "@@ -0,0 +1,1 @@\n+const marker = 1;",
  });

  it("a file with 200 changed lines starts open, one with 250 starts collapsed", () => {
    const open = renderFile(big(200));
    expect(screen.getByText("const marker = 1;")).toBeInTheDocument();
    open.unmount();

    renderFile(big(250));
    expect(screen.queryByText("const marker = 1;")).not.toBeInTheDocument();
  });
});
