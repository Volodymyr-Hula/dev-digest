import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
  it("shows no suggestions below 3 characters", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "se" } });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("lists matching existing tags from 3 characters and picks with the keyboard", () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: "sec" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["#secrets", "#security"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["security"]);
  });

  it("picks a suggestion with the mouse", () => {
    const { input, onChange } = setup(["style"]);
    fireEvent.change(input, { target: { value: "secr" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "#secrets" }));
    expect(onChange).toHaveBeenCalledWith(["style", "secrets"]);
  });

  it("adds a new free-text tag on Enter when nothing matches", () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: "Perf" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["perf"]);
  });
});
