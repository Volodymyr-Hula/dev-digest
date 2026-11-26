import { describe, it, expect } from "vitest";
import { sameList } from "./helpers";

describe("ConfigTab helpers", () => {
  it("sameList compares order-sensitively", () => {
    expect(sameList(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameList(["a", "b"], ["b", "a"])).toBe(false);
  });
});
