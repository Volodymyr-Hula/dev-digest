import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlWrapper, testMessages } from "@/test/intl";

const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({ useCreateAgent: () => ({ mutateAsync, isPending: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CreateAgentModal } from "./CreateAgentModal";

afterEach(cleanup);

describe("CreateAgentModal", () => {
  it("shows a required-name error on blur and blocks creation", async () => {
    const user = userEvent.setup();
    render(
      <IntlWrapper>
        <CreateAgentModal onClose={vi.fn()} />
      </IntlWrapper>,
    );
    const name = screen.getByLabelText(/^Name/);
    expect(screen.queryByText(testMessages.validation.required)).toBeNull();
    await user.click(name);
    await user.tab();
    expect(screen.getByText(testMessages.validation.required)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: testMessages.agents.create.create }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
