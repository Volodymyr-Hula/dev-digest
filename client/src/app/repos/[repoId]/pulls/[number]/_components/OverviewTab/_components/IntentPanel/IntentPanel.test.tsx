import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrIntentUpdate, type IntentSource, type PrIntent } from "@devdigest/shared";
import { IntlWrapper, testMessages } from "@/test/intl";
import { IntentPanel } from "./IntentPanel";

const PR_ID = "pr-1";
const msg = testMessages.prIntent;

function makeIntent(over: Partial<PrIntent> = {}): PrIntent {
  return {
    pr_id: PR_ID,
    intent: "Add token refresh to the auth middleware",
    intent_class: "feature",
    rationale: "The description links an issue asking for refresh tokens.",
    confidence: "medium",
    sources: [{ kind: "title", ref: "Add token refresh", status: "used" }],
    source: "model",
    head_sha: "abc1234",
    stale: false,
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    cost_usd: 0.0001,
    updated_at: "2026-11-27T10:00:00.000Z",
    in_scope: ["refresh endpoint"],
    out_of_scope: ["session storage"],
    ...over,
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** In-memory stand-in for the three intent endpoints; `fetch` is the only boundary mocked. */
function installApi(opts: {
  intent: PrIntent | null;
  derived?: PrIntent;
  putStatus?: number;
  getFailures?: number;
}) {
  const calls: Call[] = [];
  let current = opts.intent;
  let getFailures = opts.getFailures ?? 0;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });

      if (method === "GET" && path === `/pulls/${PR_ID}/intent`) {
        if (getFailures > 0) {
          getFailures -= 1;
          return json({ error: { code: "internal", message: "boom" } }, 500);
        }
        return json({ intent: current });
      }
      if (method === "PUT" && path === `/pulls/${PR_ID}/intent`) {
        if (opts.putStatus && opts.putStatus !== 200) {
          return json({ error: { code: "validation", message: "invalid body" } }, opts.putStatus);
        }
        // What the server promises (FR-031): stored as a user override, confidence high.
        current = makeIntent({
          intent: body.intent,
          intent_class: body.intent_class,
          in_scope: body.in_scope,
          out_of_scope: body.out_of_scope,
          source: "user",
          confidence: "high",
          stale: false,
          model: null,
          provider: null,
        });
        return json({ intent: current });
      }
      if (method === "POST" && path === `/pulls/${PR_ID}/intent/derive`) {
        current = opts.derived ?? makeIntent({ intent_class: "security", confidence: "high" });
        return json({ intent: current });
      }
      return json({ error: { code: "not_found", message: `${method} ${path}` } }, 404);
    }),
  );
  return calls;
}

function renderPanel(prId: string | null = PR_ID) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <IntlWrapper>
        <IntentPanel prId={prId} />
      </IntlWrapper>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntentPanel — read-only rendering", () => {
  it.each([
    ["low", true],
    ["medium", false],
    ["high", false],
  ] as const)("confidence %s: inferred-from-indirect-signals notice shown=%s", async (confidence, notice) => {
    installApi({ intent: makeIntent({ confidence }) });
    renderPanel();

    const badge = await screen.findByTestId("intent-confidence");
    expect(badge).toHaveAttribute("data-confidence", confidence);
    expect(badge).toHaveTextContent(msg.confidence[confidence]);
    if (notice) {
      expect(screen.getByRole("note")).toHaveTextContent(msg.lowNotice);
    } else {
      expect(screen.queryByRole("note")).toBeNull();
      expect(screen.queryByTestId("intent-low-notice")).toBeNull();
    }
  });

  it("shows class, summary, rationale, scope lists and who derived it", async () => {
    installApi({ intent: makeIntent({ intent_class: "bugfix", out_of_scope: [] }) });
    renderPanel();

    expect(await screen.findByTestId("intent-class")).toHaveAttribute("data-class", "bugfix");
    expect(screen.getByTestId("intent-class")).toHaveTextContent(msg.class.bugfix);
    expect(screen.getByTestId("intent-summary")).toHaveTextContent("Add token refresh to the auth middleware");
    expect(screen.getByText(/asking for refresh tokens/)).toBeInTheDocument();
    expect(within(screen.getByTestId("intent-in-scope")).getByText("refresh endpoint")).toBeInTheDocument();
    // An empty list says so instead of rendering a blank section.
    expect(within(screen.getByTestId("intent-out-of-scope")).getByText(msg.scope.none)).toBeInTheDocument();
    expect(screen.getByText("Derived by deepseek/deepseek-v4-flash")).toBeInTheDocument();
  });

  it("lists every source with its status, doc version tag and a hint only for unread sources", async () => {
    const sources: IntentSource[] = [
      { kind: "title", ref: "Add token refresh", status: "used" },
      { kind: "plan_doc", ref: "plans/refresh.md", status: "used", version: "pr_head", role: "target" },
      { kind: "spec_doc", ref: "docs/auth.md", status: "truncated", version: "default_branch" },
      { kind: "ticket_key", ref: "ABC-12", status: "referenced_not_fetched" },
      { kind: "linked_issue", ref: "#42", status: "not_found", reason: "no_github_token" },
      { kind: "linked_issue", ref: "#7", status: "skipped_pull_request" },
    ];
    installApi({ intent: makeIntent({ sources }) });
    renderPanel();

    await screen.findByTestId("intent-sources");
    const rows = screen.getAllByTestId("intent-source");
    expect(rows).toHaveLength(sources.length);
    const row = (ref: string) => rows.find((r) => within(r).queryByText(ref))!;

    // Plain used source: status label, no version tag, no hint.
    const title = row("Add token refresh");
    expect(title).toHaveAttribute("data-status", "used");
    expect(within(title).getByTestId("intent-source-status")).toHaveTextContent(msg.sources.status.used);
    expect(within(title).queryByTestId("intent-source-version")).toBeNull();
    expect(within(title).queryByTestId("intent-source-hint")).toBeNull();

    // Doc read at the PR head vs the default branch.
    const plan = row("plans/refresh.md");
    expect(plan).toHaveAttribute("data-kind", "plan_doc");
    expect(within(plan).getByTestId("intent-source-version")).toHaveTextContent("PR head");
    expect(within(plan).queryByTestId("intent-source-hint")).toBeNull();
    const spec = row("docs/auth.md");
    expect(spec).toHaveAttribute("data-status", "truncated");
    expect(within(spec).getByTestId("intent-source-status")).toHaveTextContent(msg.sources.status.truncated);
    expect(within(spec).getByTestId("intent-source-version")).toHaveTextContent("default branch");
    expect(within(spec).queryByTestId("intent-source-hint")).toBeNull();

    // Sources that were not read explain why.
    const ticket = row("ABC-12");
    expect(within(ticket).getByTestId("intent-source-status")).toHaveTextContent(
      msg.sources.status.referenced_not_fetched,
    );
    expect(within(ticket).getByTestId("intent-source-hint")).toHaveTextContent(
      msg.sources.hint.referenced_not_fetched,
    );
    const missing = row("#42");
    expect(missing).toHaveAttribute("data-status", "not_found");
    expect(within(missing).getByTestId("intent-source-hint")).toHaveTextContent(msg.sources.hint.not_found);
    expect(within(missing).getByTestId("intent-source-hint")).toHaveTextContent("no_github_token");
    const pr = row("#7");
    expect(within(pr).getByTestId("intent-source-hint")).toHaveTextContent(msg.sources.hint.skipped_pull_request);
  });

  it("shows the user marker only for a user override and the stale marker only when the head moved", async () => {
    installApi({ intent: makeIntent() });
    renderPanel();
    await screen.findByTestId("intent-summary");
    expect(screen.queryByTestId("intent-user-marker")).toBeNull();
    expect(screen.queryByTestId("intent-stale-marker")).toBeNull();
    cleanup();

    installApi({ intent: makeIntent({ source: "user", stale: false, model: null }) });
    renderPanel();
    expect(await screen.findByTestId("intent-user-marker")).toHaveTextContent(msg.marker.user);
    expect(screen.queryByTestId("intent-stale-marker")).toBeNull();
    // The "derived by <model>" line belongs to model-derived intents only.
    expect(screen.queryByText(/Derived by/)).toBeNull();
    cleanup();

    installApi({ intent: makeIntent({ source: "user", stale: true }) });
    renderPanel();
    expect(await screen.findByTestId("intent-user-marker")).toBeInTheDocument();
    expect(screen.getByTestId("intent-stale-marker")).toHaveTextContent(msg.marker.stale);
  });

  it("renders nothing and calls no API without a PR id", () => {
    const calls = installApi({ intent: makeIntent() });
    renderPanel(null);
    expect(screen.queryByTestId("intent-panel")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("offers a retry when loading the intent fails", async () => {
    const user = userEvent.setup();
    installApi({ intent: makeIntent(), getFailures: 1 });
    renderPanel();

    expect(await screen.findByText(msg.loadError)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: msg.retry }));
    expect(await screen.findByTestId("intent-summary")).toBeInTheDocument();
  });
});

describe("IntentPanel — derive and re-derive", () => {
  it("empty state: Derive now POSTs derive and then shows the derived intent", async () => {
    const user = userEvent.setup();
    const calls = installApi({
      intent: null,
      derived: makeIntent({ intent_class: "bugfix", confidence: "low" }),
    });
    renderPanel();

    expect(await screen.findByTestId("intent-empty")).toHaveTextContent(msg.empty.text);
    expect(screen.queryByTestId("intent-class")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Derive now" }));

    expect(await screen.findByTestId("intent-class")).toHaveAttribute("data-class", "bugfix");
    expect(screen.queryByTestId("intent-empty")).toBeNull();
    expect(screen.getByRole("note")).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toEqual([{ method: "POST", path: `/pulls/${PR_ID}/intent/derive`, body: undefined }]);
  });

  it("Re-derive POSTs derive and replaces a stale user override with the new model intent", async () => {
    const user = userEvent.setup();
    const calls = installApi({
      intent: makeIntent({ source: "user", stale: true, intent_class: "docs" }),
      derived: makeIntent({ intent_class: "security", confidence: "high", intent: "Harden token checks" }),
    });
    renderPanel();

    expect(await screen.findByTestId("intent-user-marker")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Re-derive" }));

    await waitFor(() => expect(screen.getByTestId("intent-class")).toHaveAttribute("data-class", "security"));
    expect(screen.getByTestId("intent-summary")).toHaveTextContent("Harden token checks");
    expect(screen.queryByTestId("intent-user-marker")).toBeNull();
    expect(screen.queryByTestId("intent-stale-marker")).toBeNull();
    expect(calls.filter((c) => c.method === "POST")).toEqual([
      { method: "POST", path: `/pulls/${PR_ID}/intent/derive`, body: undefined },
    ]);
  });
});

describe("IntentPanel — editing", () => {
  it("Edit → change fields → Save sends a valid PrIntentUpdate and the user marker appears", async () => {
    const user = userEvent.setup();
    const calls = installApi({ intent: makeIntent() });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("intent-edit-form")).toBeInTheDocument();
    // View-mode actions are replaced by the form's own.
    expect(screen.queryByRole("button", { name: "Re-derive" })).toBeNull();
    expect(screen.getByLabelText("Summary")).toHaveValue("Add token refresh to the auth middleware");
    expect(screen.getByLabelText("In scope (one per line)")).toHaveValue("refresh endpoint");
    expect(screen.getByLabelText("Intent class")).toHaveValue("feature");

    await user.selectOptions(screen.getByLabelText("Intent class"), "refactor");
    const summary = screen.getByLabelText("Summary");
    await user.clear(summary);
    await user.type(summary, "Rework token refresh");
    const inScope = screen.getByLabelText("In scope (one per line)");
    await user.clear(inScope);
    // Surrounding spaces and blank lines must not become scope items.
    await user.type(inScope, "parse tokens{Enter}  handle expiry  {Enter}{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByTestId("intent-user-marker")).toBeInTheDocument();
    expect(screen.queryByTestId("intent-edit-form")).toBeNull();
    expect(screen.getByTestId("intent-summary")).toHaveTextContent("Rework token refresh");
    expect(screen.getByTestId("intent-class")).toHaveAttribute("data-class", "refactor");
    expect(screen.getByTestId("intent-confidence")).toHaveAttribute("data-confidence", "high");

    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe(`/pulls/${PR_ID}/intent`);
    expect(puts[0]!.body).toEqual({
      intent_class: "refactor",
      intent: "Rework token refresh",
      in_scope: ["parse tokens", "handle expiry"],
      out_of_scope: ["session storage"],
    });
    expect(PrIntentUpdate.safeParse(puts[0]!.body).success).toBe(true);
  });

  it("Cancel closes the form without sending anything", async () => {
    const user = userEvent.setup();
    const calls = installApi({ intent: makeIntent() });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const summary = screen.getByLabelText("Summary");
    await user.clear(summary);
    await user.type(summary, "discarded draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByTestId("intent-edit-form")).toBeNull();
    expect(screen.getByTestId("intent-summary")).toHaveTextContent("Add token refresh to the auth middleware");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("disables Save for an empty summary, a summary over 600 chars, more than 8 scope lines or a line over 200 chars", async () => {
    const user = userEvent.setup();
    const calls = installApi({ intent: makeIntent() });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const save = screen.getByRole("button", { name: "Save" });
    const summary = screen.getByLabelText("Summary");
    const inScope = screen.getByLabelText("In scope (one per line)");
    const outScope = screen.getByLabelText("Out of scope (one per line)");
    // fireEvent.change sets the value programmatically — the textarea's maxLength (600)
    // only stops typing, so this is how an over-long draft (paste, autofill) is simulated.
    const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `item ${i + 1}`).join("\n");

    expect(save).toBeEnabled();

    // summary: empty / whitespace-only / 601 invalid, 600 valid
    set(summary, "");
    expect(save).toBeDisabled();
    set(summary, "   ");
    expect(save).toBeDisabled();
    set(summary, "x".repeat(601));
    expect(save).toBeDisabled();
    set(summary, "x".repeat(600));
    expect(save).toBeEnabled();

    // in scope: 9 lines invalid (with an inline error), 8 valid
    set(inScope, lines(9));
    expect(save).toBeDisabled();
    expect(screen.getByText(msg.fields.scopeInvalid)).toBeInTheDocument();
    set(inScope, lines(8));
    expect(save).toBeEnabled();
    expect(screen.queryByText(msg.fields.scopeInvalid)).toBeNull();

    // out of scope has the same limits; blank lines do not count towards 8
    set(outScope, lines(9));
    expect(save).toBeDisabled();
    set(outScope, `${lines(8)}\n\n\n`);
    expect(save).toBeEnabled();

    // a single scope line over 200 chars
    set(outScope, "y".repeat(201));
    expect(save).toBeDisabled();
    set(outScope, "y".repeat(200));
    expect(save).toBeEnabled();

    // a disabled Save never sends
    set(summary, "");
    await user.click(save);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("keeps the form open with the draft when the server rejects the save", async () => {
    const user = userEvent.setup();
    const calls = installApi({ intent: makeIntent(), putStatus: 422 });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const summary = screen.getByLabelText("Summary");
    await user.clear(summary);
    await user.type(summary, "my edit");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
    expect(screen.getByTestId("intent-edit-form")).toBeInTheDocument();
    expect(screen.getByLabelText("Summary")).toHaveValue("my edit");
    expect(screen.queryByTestId("intent-user-marker")).toBeNull();
  });
});
