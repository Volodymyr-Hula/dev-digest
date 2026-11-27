import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import { IntlWrapper } from "@/test/intl";
import { finding } from "@/test/findings";
import { DiffTab } from "./DiffTab";

/**
 * Files changed tab (spec: specs/smart-diff.md FR-014..FR-019, FR-026, FR-030..FR-032, T-014).
 * `fetch` is the only boundary mocked: reviews, smart-diff and comments come from an in-memory API.
 */

const PR_ID = "pr-1";
const ROLE_LABELS = ["Core", "Tests", "Wiring", "Docs", "Boilerplate"];

// `pr.files` order = the order GitHub returned (Original order).
const FILES: PrFile[] = [
  { path: "docs/rate-limiting.md", additions: 2, deletions: 0, patch: "@@ -0,0 +1,2 @@\n+# Rate limiting\n+100 req/min" },
  { path: "pnpm-lock.yaml", additions: 2, deletions: 1, patch: "@@ -1,1 +1,2 @@\n lockfileVersion: 9\n+limiter: 2.0.0" },
  { path: "src/middleware/ratelimit.test.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+it.todo('limits');" },
  { path: ".env.example", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n PORT=3000\n+RATE_LIMIT_MAX=100" },
  {
    path: "src/config.ts",
    additions: 2,
    deletions: 0,
    patch: "@@ -9,2 +9,4 @@\n export const config = {\n   port: 3000,\n+  // limiter\n+  stripeKey: 'sk_live_x',",
  },
  { path: "src/api/users.ts", additions: 1, deletions: 0, patch: "@@ -10,1 +10,2 @@\n export const a = 1;\n+export const b = 2;" },
];

/** The server's answer; within `core` it lists users.ts first, the client must reorder by `files`. */
function smartDiff(over: Partial<Record<string, string[]>> = {}): SmartDiff {
  const paths: Record<string, string[]> = {
    core: ["src/api/users.ts", "src/config.ts"],
    tests: ["src/middleware/ratelimit.test.ts"],
    wiring: [".env.example"],
    docs: ["docs/rate-limiting.md"],
    boilerplate: ["pnpm-lock.yaml"],
    ...over,
  };
  return {
    groups: (["core", "tests", "wiring", "docs", "boilerplate"] as const).map((role) => ({
      role,
      files: paths[role]!.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
    })),
    split_suggestion: { too_big: false, total_lines: 10, proposed_splits: [] },
  };
}

// 5 findings in 2 files: 3 in src/config.ts (two on line 12, one on 11), 2 off-patch in src/api/users.ts.
const FINDINGS: FindingRecord[] = [
  finding({ id: "f-crit", severity: "CRITICAL", title: "Hardcoded Stripe secret key", file: "src/config.ts", start_line: 12, end_line: 12, rationale: "A live key is committed.", suggestion: "Use an env var." }),
  finding({ id: "f-warn", severity: "WARNING", title: "Limiter config is not validated", file: "src/config.ts", start_line: 12, end_line: 12 }),
  finding({ id: "f-sugg", severity: "SUGGESTION", title: "Name the limiter comment", file: "src/config.ts", start_line: 11, end_line: 11 }),
  finding({ id: "f-n1", severity: "WARNING", title: "N+1 query in user list endpoint", file: "src/api/users.ts", start_line: 45, end_line: 52 }),
  finding({ id: "f-n2", severity: "SUGGESTION", title: "Paginate the user list", file: "src/api/users.ts", start_line: 50, end_line: 50 }),
];

function reviewRecord(findings: FindingRecord[]): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: PR_ID,
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 61,
    model: "seed",
    created_at: "2026-11-20T10:00:00Z",
    findings,
  };
}

interface Call {
  method: string;
  path: string;
}

function installApi(
  opts: {
    reviews?: ReviewRecord[];
    smartDiff?: SmartDiff;
    smartDiffStatus?: number;
    /** smart-diff never answers: the loading state stays on screen. */
    smartDiffPending?: boolean;
    /** Status of POST /findings/:id/{accept|dismiss}; non-200 → error envelope, nothing stored. */
    actionStatus?: number;
  } = {},
) {
  const calls: Call[] = [];
  let reviews = opts.reviews ?? [reviewRecord(FINDINGS)];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      calls.push({ method, path });

      if (method === "GET" && path === `/pulls/${PR_ID}/reviews`) return json(reviews);
      if (method === "GET" && path === `/pulls/${PR_ID}/comments`) return json([]);
      if (method === "GET" && path === `/pulls/${PR_ID}/smart-diff`) {
        if (opts.smartDiffPending) return new Promise<Response>(() => {});
        if (opts.smartDiffStatus && opts.smartDiffStatus !== 200) {
          return json({ error: { code: "internal_error", message: "boom" } }, opts.smartDiffStatus);
        }
        return json(opts.smartDiff ?? smartDiff());
      }
      const action = /^\/findings\/([^/]+)\/(accept|dismiss)$/.exec(path);
      if (method === "POST" && action && opts.actionStatus && opts.actionStatus !== 200) {
        return json({ error: { code: "internal_error", message: "boom" } }, opts.actionStatus);
      }
      if (method === "POST" && action) {
        // What the server promises: the finding is stamped and the next /reviews read returns it.
        const [, id, kind] = action;
        const stamp = "2026-11-21T00:00:00Z";
        let updated: FindingRecord | undefined;
        reviews = reviews.map((r) => ({
          ...r,
          findings: r.findings.map((f) => {
            if (f.id !== id) return f;
            updated = { ...f, ...(kind === "accept" ? { accepted_at: stamp } : { dismissed_at: stamp }) };
            return updated;
          }),
        }));
        return json({ finding: updated });
      }
      return json({ error: { code: "not_found", message: `${method} ${path}` } }, 404);
    }),
  );
  return calls;
}

function renderTab(files: PrFile[] = FILES) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlWrapper>
        <DiffTab prId={PR_ID} files={files} canComment={false} repoFullName="acme/payments-api" headSha="abc1234" />
      </IntlWrapper>
    </QueryClientProvider>,
  );
}

/** Group header buttons (the only buttons that carry aria-expanded), in DOM order. */
async function groupHeaders() {
  const root = await screen.findByTestId("smart-diff-groups");
  return within(root)
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-expanded"));
}

const headerOf = (headers: HTMLElement[], label: string) => {
  const h = headers.find((b) => b.textContent?.startsWith(label));
  if (!h) throw new Error(`no group header "${label}"`);
  return h;
};

/** True when `a` comes before `b` in the document. */
const before = (a: HTMLElement, b: HTMLElement) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  installApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DiffTab — Smart order", () => {
  it("shows the summary header and renders the groups core → tests → wiring → docs → boilerplate with their file counts", async () => {
    renderTab();

    expect(screen.getByText("Reviewer-ordered diff")).toBeInTheDocument();
    // Σ over FILES: 6 files, +9 −1
    expect(screen.getByText("6 files · +9 −1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "false");

    const headers = await groupHeaders();
    expect(headers.map((h) => ROLE_LABELS.find((l) => h.textContent?.startsWith(l)))).toEqual(ROLE_LABELS);
    // each header: role label, description, "N files"
    expect(headerOf(headers, "Core")).toHaveTextContent("The substance of the change — review closely");
    expect(headerOf(headers, "Core")).toHaveTextContent("2 files");
    for (const l of ["Tests", "Wiring", "Docs", "Boilerplate"]) {
      expect(headerOf(headers, l)).toHaveTextContent("1 files");
    }
  });

  it("starts docs and boilerplate collapsed; the lock file shows only after its group is expanded", async () => {
    const user = userEvent.setup();
    renderTab();
    const headers = await groupHeaders();

    for (const l of ["Core", "Tests", "Wiring"]) expect(headerOf(headers, l)).toHaveAttribute("aria-expanded", "true");
    for (const l of ["Docs", "Boilerplate"]) expect(headerOf(headers, l)).toHaveAttribute("aria-expanded", "false");

    // open groups show their files; collapsed ones hide theirs
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.test.ts")).toBeInTheDocument();
    expect(screen.getByText(".env.example")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    expect(screen.queryByText("docs/rate-limiting.md")).not.toBeInTheDocument();

    await user.click(headerOf(headers, "Boilerplate"));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    expect(headerOf(headers, "Boilerplate")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("docs/rate-limiting.md")).not.toBeInTheDocument();

    // a second click collapses it again; an open group collapses on click too
    await user.click(headerOf(headers, "Boilerplate"));
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    await user.click(headerOf(headers, "Tests"));
    expect(screen.queryByText("src/middleware/ratelimit.test.ts")).not.toBeInTheDocument();
  });

  it("orders the files of a group by their index in pr.files, not by the server's order", async () => {
    renderTab();
    await groupHeaders();
    // server lists src/api/users.ts first, pr.files has src/config.ts first
    expect(before(screen.getByText("src/config.ts"), screen.getByText("src/api/users.ts"))).toBe(true);
  });

  it("the group counter is the number of FILES with findings: 5 findings in 2 files → ● 2; groups without findings show none", async () => {
    renderTab();
    const headers = await groupHeaders();

    const counter = within(headerOf(headers, "Core")).getByTestId("group-finding-count");
    expect(counter).toHaveTextContent("● 2");
    expect(counter).not.toHaveTextContent("5");
    expect(counter).toHaveAccessibleName("2 files with findings");
    for (const l of ["Tests", "Wiring", "Docs", "Boilerplate"]) {
      expect(within(headerOf(headers, l)).queryByTestId("group-finding-count")).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Review not run yet — run a review to see findings in the diff")).not.toBeInTheDocument();
  });

  it("without any review it shows the not-reviewed note and no counter, dot or finding card", async () => {
    installApi({ reviews: [] });
    renderTab();
    await groupHeaders();

    expect(screen.getByText("Review not run yet — run a review to see findings in the diff")).toBeInTheDocument();
    expect(screen.queryByTestId("group-finding-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("file-finding-dot")).not.toBeInTheDocument();
    // nothing to show or hide → no annotations toggle
    expect(screen.queryByRole("button", { name: /comments & findings/ })).not.toBeInTheDocument();
  });

  it("hides a group the server returned empty", async () => {
    installApi({ smartDiff: smartDiff({ docs: [], boilerplate: [] }) });
    renderTab(FILES.filter((f) => f.path !== "docs/rate-limiting.md" && f.path !== "pnpm-lock.yaml"));
    const headers = await groupHeaders();
    expect(headers).toHaveLength(3);
    expect(headers.map((h) => ROLE_LABELS.find((l) => h.textContent?.startsWith(l)))).toEqual(["Core", "Tests", "Wiring"]);
  });

  it("a failed smart-diff request shows a retryable error; Original order still works", async () => {
    installApi({ smartDiffStatus: 500 });
    const user = userEvent.setup();
    renderTab();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the smart diff");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("smart-diff-groups")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByText("docs/rate-limiting.md")).toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });
});

describe("DiffTab — Smart order edge cases", () => {
  it("while the smart diff loads, the group area shows a skeleton and no group header, file or error", async () => {
    installApi({ smartDiffPending: true });
    const { container } = renderTab();

    // reviews and comments resolve; wait until the not-reviewed state is gone/known so the tab has settled
    await screen.findByRole("button", { name: /Hide comments & findings/ });
    expect(container.querySelector(".skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-diff-groups")).not.toBeInTheDocument();
    for (const l of ROLE_LABELS) expect(screen.queryByText(l)).not.toBeInTheDocument();
    expect(screen.queryByText("src/config.ts")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a PR with 0 files shows the 'No changed files.' empty state, no groups and no not-reviewed note", async () => {
    installApi({ reviews: [], smartDiff: smartDiff({ core: [], tests: [], wiring: [], docs: [], boilerplate: [] }) });
    renderTab([]);

    expect(screen.getByText("No changed files.")).toBeInTheDocument();
    expect(screen.getByText("0 files · +0 −0")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-diff-groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Review not run yet — run a review to see findings in the diff")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("DiffTab — Original order", () => {
  it("restores the flat list in pr.files order, with nothing collapsed", async () => {
    const user = userEvent.setup();
    renderTab();
    await groupHeaders();

    await user.click(screen.getByRole("button", { name: "Original order" }));

    expect(screen.queryByTestId("smart-diff-groups")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "true");
    const nodes = FILES.map((f) => screen.getByText(f.path));
    for (let i = 1; i < nodes.length; i++) expect(before(nodes[i - 1]!, nodes[i]!)).toBe(true);

    // and back to Smart order
    await user.click(screen.getByRole("button", { name: "Smart order" }));
    expect((await groupHeaders()).length).toBe(5);
  });

  it("keeps the inline findings in Original order", async () => {
    const user = userEvent.setup();
    renderTab();
    await groupHeaders();
    await user.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });
});

describe("DiffTab — findings in the diff", () => {
  it("shows the red dots and inline cards, and the toggle hides the cards but keeps the dots", async () => {
    const user = userEvent.setup();
    renderTab();
    await groupHeaders();

    expect(screen.getAllByTestId("file-finding-dot")).toHaveLength(2); // config.ts and users.ts
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    // the off-patch users.ts findings sit in the end-of-file block
    expect(screen.getByText("Findings outside the shown lines")).toBeInTheDocument();

    // no GitHub comments, 5 findings → the toggle is offered
    const hide = screen.getByRole("button", { name: "Hide comments & findings (5)" });
    await user.click(hide);

    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
    expect(screen.queryByText("N+1 query in user list endpoint")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the shown lines")).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("file-finding-dot")).toHaveLength(2);
    // the group counter does not depend on the toggle
    expect(screen.getByTestId("group-finding-count")).toHaveTextContent("● 2");

    await user.click(screen.getByRole("button", { name: "Show comments & findings (5)" }));
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });

  it("Accept and Reject on a card POST to /findings/:id/{accept|dismiss}; the card shows the new state and still counts", async () => {
    const calls = installApi();
    const user = userEvent.setup();
    renderTab();
    await groupHeaders();

    const cardOf = (title: string) => screen.getByText(title).closest("[data-finding-id]") as HTMLElement;

    await user.click(within(cardOf("Hardcoded Stripe secret key")).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/findings/f-crit/accept" }));
    // after the reviews refetch the card carries the accepted marker
    await waitFor(() => expect(within(cardOf("Hardcoded Stripe secret key")).getByText("accepted")).toBeInTheDocument());

    await user.click(within(cardOf("Limiter config is not validated")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/findings/f-warn/dismiss" }));
    await waitFor(() => expect(within(cardOf("Limiter config is not validated")).getByText("rejected")).toBeInTheDocument());

    // accepted/dismissed findings stay on screen and keep the counter and the dots (FR-027)
    expect(screen.getByTestId("group-finding-count")).toHaveTextContent("● 2");
    expect(screen.getAllByTestId("file-finding-dot")).toHaveLength(2);
  });
});

describe("DiffTab — failed finding action (FR-026)", () => {
  it("a failed Accept (POST 500) leaves the card in its old state: no accepted marker, the button is usable again", async () => {
    const calls = installApi({ actionStatus: 500 });
    const user = userEvent.setup();
    renderTab();
    await groupHeaders();

    const cardOf = (title: string) => screen.getByText(title).closest("[data-finding-id]") as HTMLElement;
    await user.click(within(cardOf("Hardcoded Stripe secret key")).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/findings/f-crit/accept" }));

    // let the failed mutation settle and any reviews refetch land
    await waitFor(() => expect(within(cardOf("Hardcoded Stripe secret key")).getByRole("button", { name: "Accept" })).toBeEnabled());
    expect(within(cardOf("Hardcoded Stripe secret key")).queryByText("accepted")).not.toBeInTheDocument();
    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
    // everything else is unchanged: the card and the counter stay
    expect(screen.getByTestId("group-finding-count")).toHaveTextContent("● 2");
    expect(screen.getAllByTestId("file-finding-dot")).toHaveLength(2);
  });
});
