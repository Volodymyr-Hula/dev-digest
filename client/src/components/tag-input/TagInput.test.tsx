import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlWrapper } from "@/test/intl";
import { TagInput } from "./TagInput";

afterEach(cleanup);

function setup(value: string[] = []) {
  const onChange = vi.fn();
  render(
    <IntlWrapper>
      <TagInput value={value} onChange={onChange} suggestions={["security", "secrets", "style"]} ariaLabel="Tags" />
    </IntlWrapper>,
  );
  return { onChange, input: screen.getByLabelText("Tags") };
}

describe("TagInput", () => {
  it("shows no suggestions below 3 characters", async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, "se");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("lists matching existing tags from 3 characters and picks with the keyboard", async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.type(input, "sec");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["#secrets", "#security"]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["security"]);
  });

  it("picks a suggestion with the mouse", async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup(["style"]);
    await user.type(input, "secr");
    await user.click(screen.getByRole("option", { name: "#secrets" }));
    expect(onChange).toHaveBeenCalledWith(["style", "secrets"]);
  });

  it("adds a new free-text tag on Enter when nothing matches", async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.type(input, "Perf{Enter}");
    expect(onChange).toHaveBeenCalledWith(["perf"]);
  });
});
