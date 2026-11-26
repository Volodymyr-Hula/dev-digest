import { describe, it, expect } from "vitest";
import { addTag, matchTags, normalizeTag } from "./helpers";

describe("tag-input helpers", () => {
  it("normalizeTag trims and lowercases", () => {
    expect(normalizeTag("  OWASP ")).toBe("owasp");
  });

  it("addTag skips empties and duplicates", () => {
    expect(addTag(["a"], " A ")).toEqual(["a"]);
    expect(addTag(["a"], "  ")).toEqual(["a"]);
    expect(addTag(["a"], "B")).toEqual(["a", "b"]);
  });

  it("matchTags needs 3 chars, skips picked, ranks prefix matches first", () => {
    const all = ["api-security", "security", "secrets", "style"];
    expect(matchTags("se", all, [])).toEqual([]);
    expect(matchTags("SEC", all, [])).toEqual(["secrets", "security", "api-security"]);
    expect(matchTags("sec", all, ["secrets"])).toEqual(["security", "api-security"]);
  });
});
