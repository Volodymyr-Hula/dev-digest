import { describe, it, expect } from "vitest";
import { githubRepoUrl, httpsUrl, maxLen, required, skillName, validateValues } from "./validation";

describe("validation rules", () => {
  it("required rejects blank strings", () => {
    expect(required("  ")).toEqual({ key: "required" });
    expect(required("x")).toBeNull();
  });

  it("maxLen reports the limit", () => {
    expect(maxLen(3)("abcd")).toEqual({ key: "tooLong", values: { max: 3 } });
    expect(maxLen(3)("abc")).toBeNull();
  });

  it("skillName accepts kebab-case only and leaves empty to required", () => {
    expect(skillName("Security audit")).toEqual({ key: "skillNameFormat" });
    expect(skillName("security-audit")).toBeNull();
    expect(skillName("")).toBeNull();
  });

  it("httpsUrl distinguishes malformed and non-https", () => {
    expect(httpsUrl("nope")).toEqual({ key: "invalidUrl" });
    expect(httpsUrl("http://x.tld/a.md")).toEqual({ key: "httpsUrl" });
    expect(httpsUrl("https://x.tld/a.md")).toBeNull();
  });

  it("githubRepoUrl accepts https and ssh forms", () => {
    expect(githubRepoUrl("https://github.com/acme/api")).toBeNull();
    expect(githubRepoUrl("git@github.com:acme/api.git")).toBeNull();
    expect(githubRepoUrl("https://gitlab.com/acme/api")).toEqual({ key: "githubRepoUrl" });
  });

  it("validateValues keeps the first failing rule per field", () => {
    const errors = validateValues({ name: "", body: "ok" }, { name: [required, skillName], body: [required] });
    expect(errors).toEqual({ name: { key: "required" } });
  });
});
