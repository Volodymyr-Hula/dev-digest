import { describe, it, expect } from "vitest";
import { approxTokens, sameList } from "./helpers";

describe("ConfigTab helpers", () => {
  it("approxTokens rounds chars/4 up", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abcde")).toBe(2);
  });

  it("sameList compares order-sensitively", () => {
    expect(sameList(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameList(["a", "b"], ["b", "a"])).toBe(false);
  });
});
