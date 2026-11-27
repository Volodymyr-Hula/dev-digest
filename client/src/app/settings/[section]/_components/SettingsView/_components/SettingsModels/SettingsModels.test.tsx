import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntlWrapper, testMessages } from "@/test/intl";
import { SettingsModels } from "./SettingsModels";

/** `fetch` is the only boundary mocked: GET /settings and the OpenRouter model list. */
function installApi(featureModels: Record<string, { provider: string; model: string }>) {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/settings") return json({ feature_models: featureModels });
      if (path === "/providers/openrouter/models") return json([]);
      return new Response("{}", { status: 404 });
    }),
  );
}

function renderModels() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <IntlWrapper>
        <SettingsModels />
      </IntlWrapper>
    </QueryClientProvider>,
  );
}

/** The FormField wrapper that holds one feature's label, picker and hint. */
function rowOf(label: string): HTMLElement {
  return screen.getByText(label).closest("label")!.parentElement!.parentElement!;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsModels", () => {
  it("lists the PR Intent classifier with its default model when no override is saved", async () => {
    // Another feature is overridden: seeing its model proves the settings have loaded
    // (before that every row falls back to its default and the assertion would be vacuous).
    installApi({ onboarding: { provider: "openrouter", model: "acme/loaded-marker" } });
    renderModels();

    await screen.findByText("acme/loaded-marker");
    const row = rowOf("PR Intent (classifier)");
    expect(within(row).getByText("deepseek/deepseek-v4-flash")).toBeInTheDocument();
    expect(within(row).getByText(testMessages.settings.models.usingDefault)).toBeInTheDocument();
    expect(within(row).getByText("Derives a PR’s intent and scope before review.")).toBeInTheDocument();
    // The old label is gone.
    expect(screen.queryByText("PR Review · Intent")).toBeNull();
  });

  it("shows the saved model and no default tag when review_intent is overridden", async () => {
    installApi({ review_intent: { provider: "openrouter", model: "acme/custom-classifier" } });
    renderModels();

    const picked = await screen.findByText("acme/custom-classifier");
    expect(picked).toBeInTheDocument();
    const row = rowOf("PR Intent (classifier)");
    expect(within(row).getByText("acme/custom-classifier")).toBeInTheDocument();
    expect(within(row).queryByText("deepseek/deepseek-v4-flash")).toBeNull();
    expect(within(row).queryByText(testMessages.settings.models.usingDefault)).toBeNull();
    // Other features without an override still show "default".
    expect(within(rowOf("Onboarding Tour")).getByText(testMessages.settings.models.usingDefault)).toBeInTheDocument();
  });
});
