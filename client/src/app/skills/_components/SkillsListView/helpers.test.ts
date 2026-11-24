import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills } from "./helpers";

const sk = (name: string, description: string, tags: string[]): Skill => ({
  id: name,
  name,
  description,
  type: "custom",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  tags,
  trusted: true,
  agent_count: 0,
});

describe("filterSkills", () => {
  const all = [sk("no-then-chains", "async/await", ["style"]), sk("secret-gate", "Detects keys", ["owasp"])];

  it("returns everything for a blank query", () => {
    expect(filterSkills(all, "  ")).toHaveLength(2);
  });

  it("matches name, description and tags case-insensitively", () => {
    expect(filterSkills(all, "THEN").map((s) => s.name)).toEqual(["no-then-chains"]);
    expect(filterSkills(all, "detects").map((s) => s.name)).toEqual(["secret-gate"]);
    expect(filterSkills(all, "owasp").map((s) => s.name)).toEqual(["secret-gate"]);
  });
});
