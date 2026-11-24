import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ConventionScanState, ConventionsResponse } from "@devdigest/shared";
import { IntlWrapper, testMessages } from "@/test/intl";
import { makeConvention } from "@/test/conventions";

const m = testMessages.conventions.page;
let response: ConventionsResponse | undefined;
const startScan = vi.fn();

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", full_name: "acme/payments-api" }] }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/hooks/conventions", () => ({
  isScanActive: (d: ConventionsResponse | undefined) => d?.scan?.status === "queued" || d?.scan?.status === "running",
  useConventions: () => ({ data: response, isLoading: false, isError: false, refetch: vi.fn() }),
  useStartConventionsScan: () => ({ mutate: startScan, isPending: false }),
  useUpdateConvention: () => ({ mutateAsync: vi.fn(), isPending: false, variables: undefined }),
}));

import { ConventionsView } from "./ConventionsView";

afterEach(cleanup);
beforeEach(() => startScan.mockReset());

const STATS = { accepted: 0, rejected: 0, in_skills: 0 };
const scan = (status: ConventionScanState["status"], over: Partial<ConventionScanState> = {}): ConventionScanState => ({
  status,
  error: null,
  error_code: null,
  started_at: null,
  finished_at: null,
  ...over,
});

function renderView(data: ConventionsResponse) {
  response = data;
  render(
    <IntlWrapper>
      <ConventionsView repoId="r1" />
    </IntlWrapper>,
  );
}

describe("ConventionsView", () => {
  it("before the first scan: an empty state that starts the extraction", () => {
    renderView({ scan: null, items: [], stats: STATS });
    expect(screen.getByText(m.empty.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.empty.cta }));
    expect(startScan).toHaveBeenCalled();
  });

  it("a finished scan with nothing new says so and offers a re-scan", () => {
    renderView({ scan: scan("done"), items: [], stats: STATS });
    expect(screen.getByText(m.noneFound.title)).toBeInTheDocument();
    expect(screen.queryByText(m.empty.title)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: m.noneFound.cta }));
    expect(startScan).toHaveBeenCalled();
  });

  it("a failed scan shows the message for its code, the raw detail and a retry", () => {
    renderView({
      scan: scan("failed", { error: "Model call failed: 401 invalid key", error_code: "llm_failed" }),
      items: [],
      stats: STATS,
    });
    expect(screen.getByText(m.failed.title)).toBeInTheDocument();
    expect(screen.getByText(m.failed.codes.llm_failed)).toBeInTheDocument();
    expect(screen.getByText("Details: Model call failed: 401 invalid key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.failed.retry }));
    expect(startScan).toHaveBeenCalled();
  });

  it("a failed re-scan keeps the list and shows the error above it", () => {
    renderView({
      scan: scan("failed", { error: "interrupted", error_code: "interrupted" }),
      items: [makeConvention()],
      stats: STATS,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(m.failed.codes.interrupted);
    expect(screen.getByText("Relative imports carry the .js suffix")).toBeInTheDocument();
  });
});
