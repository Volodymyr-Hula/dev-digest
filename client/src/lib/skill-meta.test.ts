import { describe, it, expect } from "vitest";
import { SkillName } from "@devdigest/shared";
import { isValidSkillName } from "./skill-meta";

describe("isValidSkillName", () => {
  const cases = ["pr-quality-rubric", "a1", "x", "Bad", "a--b", "-a", "a-", "a b", "", "a".repeat(64), "a".repeat(65)];

  it("agrees with the shared SkillName contract", () => {
    for (const c of cases) expect(isValidSkillName(c), c).toBe(SkillName.safeParse(c).success);
  });
});
