import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { isValidSkillName } from "@/lib/skill-meta";
import { buildSkillBody, evidenceFiles, fenceFor, langForPath, suggestSkillName } from "./helpers";

const conv = (rule: string, path: string, snippet: string): ConventionCandidate => ({
  id: rule,
  rule,
  evidence_path: path,
  evidence_snippet: snippet,
  confidence: 0.9,
  status: "accepted",
  skill_id: null,
  created_at: "2026-11-24T00:00:00Z",
});

describe("buildSkillBody", () => {
  it("lists each rule with its path and the full snippet in a fenced block", () => {
    const body = buildSkillBody("Conventions of acme/api", "Evidence", [
      conv("Use .js imports", "src/a.ts", "import x from './x.js';\n\nexport { x };"),
    ]);
    expect(body).toBe(
      [
        "# Conventions of acme/api",
        "",
        "- Use .js imports",
        "  Evidence: `src/a.ts`",
        "",
        "  ```ts",
        "  import x from './x.js';",
        "",
        "  export { x };",
        "  ```",
        "",
      ].join("\n"),
    );
  });

  it("uses a longer fence when the snippet contains backticks", () => {
    expect(fenceFor("const s = `x`;")).toBe("```");
    expect(fenceFor("```md\n```")).toBe("````");
  });
});

describe("helpers", () => {
  it("maps extensions to fence languages", () => {
    expect(langForPath("a/b.tsx")).toBe("tsx");
    expect(langForPath("Makefile")).toBe("");
  });

  it("dedupes evidence files in order", () => {
    expect(evidenceFiles([conv("a", "x.ts", "1"), conv("b", "y.ts", "2"), conv("c", "x.ts", "3")])).toEqual(["x.ts", "y.ts"]);
  });

  it("suggests a valid kebab-case skill name", () => {
    expect(suggestSkillName("acme/Payments API")).toBe("payments-api-conventions");
    expect(suggestSkillName(null)).toBe("conventions");
    const long = suggestSkillName(`o/${"x".repeat(100)}`);
    expect(long.length).toBeLessThanOrEqual(64);
    for (const n of [long, suggestSkillName("o/--weird__name--")]) expect(isValidSkillName(n)).toBe(true);
  });
});
