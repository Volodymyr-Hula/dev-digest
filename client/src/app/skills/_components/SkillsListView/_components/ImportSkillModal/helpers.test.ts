import { describe, it, expect } from "vitest";
import { bytesToBase64, isImportableName } from "./helpers";

describe("ImportSkillModal helpers", () => {
  it("accepts markdown and archives only", () => {
    expect(isImportableName("SKILL.md")).toBe(true);
    expect(isImportableName("x.skill")).toBe(true);
    expect(isImportableName("run.sh")).toBe(false);
  });

  it("base64-encodes bytes, including large inputs", () => {
    expect(bytesToBase64(new TextEncoder().encode("hi"))).toBe("aGk=");
    const big = new Uint8Array(100_000).fill(65);
    expect(atob(bytesToBase64(big))).toHaveLength(100_000);
  });
});
