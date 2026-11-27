import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, PrDetail, PrMeta, Repo, ReviewRecord, SmartDiff } from "@devdigest/shared";
import { IntlWrapper } from "@/test/intl";
import { finding } from "@/test/findings";
import { RepoProvider } from "@/lib/repo-context";

/**
 * PR detail page — a finished review run refreshes the Files changed tab without a reload
 * (spec: specs/smart-diff.md FR-033). Boundaries faked: `fetch` (in-memory API), `EventSource`
 * (the run's SSE stream), `next/navigation` (URL state) and the app shell chrome.
 * The QueryClient uses the production `staleTime` (30s): without an explicit invalidation the
 * smart-diff data would be served from cache after the run.
 */

// ---- URL state: a tiny store so tab clicks (router.replace) re-render the page ----
const url = { tab: "diff", listeners: new Set<() => void>() };
const setTab = (tab: string) => {
  url.tab = tab;
  url.listeners.forEach((l) => l());
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1", number: "482" }),
  usePathname: () => "/repos/repo-1/pulls/482",
  useRouter: () => ({
    replace: (href: string) => setTab(new URL(href, "http://x").searchParams.get("tab") ?? "overview"),
  }),
  useSearchParams: () => {
    const tab = React.useSyncExternalStore(
      (cb) => {
        url.listeners.add(cb);
        return () => url.listeners.delete(cb);
      },
      () => url.tab,
      () => url.tab,
    );
    return new URLSearchParams({ tab });
  },
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ---- the run's SSE stream: the page only cares that it closes ----
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener() {}
  close() {}
}

import PRDetailPage from "./page";

const PR_ID = "pr-482";
const REPO: Repo = {
  id: "repo-1",
  workspace_id: "ws",
  owner: "acme",
  name: "payments-api",
  full_name: "acme/payments-api",
  default_branch: "main",
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};
const META: PrMeta = {
  id: PR_ID,
  number: 482,
  title: "Add rate limiting",
  author: "marisa.koch",
  branch: "feat/rl",
  base: "main",
  head_sha: "abc1234",
  additions: 2,
  deletions: 0,
  files_count: 1,
  status: "open",
};
const DETAIL: PrDetail = {
  ...META,
  body: "body",
  files: [
    {
      path: "src/config.ts",
      additions: 2,
      deletions: 0,
      patch: "@@ -9,2 +9,4 @@\n export const config = {\n   port: 3000,\n+  // limiter\n+  stripeKey: 'sk_live_x',",
    },
  ],
  commits: [],
};
const SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [{ path: "src/config.ts", additions: 2, deletions: 0, finding_lines: [] }] },
    { role: "tests", files: [] },
    { role: "wiring", files: [] },
    { role: "docs", files: [] },
    { role: "boilerplate", files: [] },
  ],
  split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
};
const FINDINGS: FindingRecord[] = [
  finding({ id: "f-crit", severity: "CRITICAL", title: "Hardcoded Stripe secret key", file: "src/config.ts", start_line: 12, end_line: 12 }),
];
const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: PR_ID,
  agent_id: "agent-1",
  run_id: "run-1",
  kind: "review",
  verdict: "request_changes",
  summary: "s",
  score: 61,
  model: "m",
  created_at: "2026-11-20T10:00:00Z",
  findings: FINDINGS,
};

function installApi() {
  const state = {
    reviews: [] as ReviewRecord[],
    active: [{ run_id: "run-1", agent_id: "agent-1", agent_name: "Security", ran_at: null }] as unknown[],
    calls: [] as string[],
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      state.calls.push(`${method} ${path}`);
      if (path === "/repos") return json([REPO]);
      if (path === "/repos/repo-1/pulls") return json([META]);
      if (path === `/pulls/${PR_ID}`) return json(DETAIL);
      if (path === `/pulls/${PR_ID}/reviews`) return json(state.reviews);
      if (path === `/pulls/${PR_ID}/runs/active`) return json(state.active);
      if (path === `/pulls/${PR_ID}/runs`) return json([]);
      if (path === `/pulls/${PR_ID}/comments`) return json([]);
      if (path === `/pulls/${PR_ID}/smart-diff`) return json(SMART_DIFF);
      if (path === "/agents") return json([]);
      return json({ error: { code: "not_found", message: `${method} ${path}` } }, 404);
    }),
  );
  return state;
}

const count = (calls: string[], entry: string) => calls.filter((c) => c === entry).length;

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <IntlWrapper>
        <RepoProvider>
          <PRDetailPage />
        </RepoProvider>
      </IntlWrapper>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  url.tab = "diff";
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PR detail page — a finished run updates the Files changed tab (FR-033)", () => {
  it("after the run's stream closes, the smart diff and reviews are refetched and the counter, dot and card appear without a reload", async () => {
    const api = installApi();
    const user = userEvent.setup();
    renderPage();

    // Before the run: Files changed is in the not-reviewed state.
    expect(await screen.findByTestId("smart-diff-groups")).toBeInTheDocument();
    expect(screen.getByText("Review not run yet — run a review to see findings in the diff")).toBeInTheDocument();
    expect(screen.queryByTestId("group-finding-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("file-finding-dot")).not.toBeInTheDocument();
    expect(count(api.calls, `GET /pulls/${PR_ID}/smart-diff`)).toBe(1);
    const reviewReadsBefore = count(api.calls, `GET /pulls/${PR_ID}/reviews`);

    // Go to the run's tab: the live stream opens.
    await user.click(screen.getByRole("button", { name: /Agent runs/ }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    // The run finishes server-side: its review is stored, no run is active any more; the stream closes.
    api.reviews = [REVIEW];
    api.active = [];
    act(() => FakeEventSource.instances[0]!.onerror?.());

    await waitFor(() => expect(count(api.calls, `GET /pulls/${PR_ID}/reviews`)).toBeGreaterThan(reviewReadsBefore));

    // Back on Files changed, with no reload.
    await user.click(screen.getByRole("button", { name: /Files changed/ }));
    const counter = await screen.findByTestId("group-finding-count");
    expect(counter).toHaveTextContent("● 1");
    expect(screen.getByTestId("file-finding-dot")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.queryByText("Review not run yet — run a review to see findings in the diff")).not.toBeInTheDocument();
    // The smart diff itself was invalidated, not served from the 30s cache.
    await waitFor(() => expect(count(api.calls, `GET /pulls/${PR_ID}/smart-diff`)).toBeGreaterThanOrEqual(2));
  });
});
