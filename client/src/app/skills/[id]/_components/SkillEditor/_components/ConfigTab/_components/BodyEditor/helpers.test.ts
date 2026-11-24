import { describe, it, expect } from "vitest";
import { approxTokens } from "./helpers";

describe("BodyEditor helpers", () => {
  it("approxTokens rounds chars/4 up", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abcde")).toBe(2);
  });
});
