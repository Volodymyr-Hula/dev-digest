import { describe, it, expect } from "vitest";
import type { SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { toGroupedFiles, filesWithFindings } from "./helpers";

/** Spec: specs/smart-diff.md FR-006, FR-017, FR-018, T-014. */

const pf = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });
const group = (role: SmartDiffRole, ...paths: string[]): SmartDiffGroup => ({
  role,
  files: paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
});
const ROLES: SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];
const allGroups = (over: Partial<Record<SmartDiffRole, string[]>>) =>
  ROLES.map((r) => group(r, ...(over[r] ?? [])));

describe("toGroupedFiles", () => {
  it("keeps the server's group order and orders each group's files by their index in `files`", () => {
    const files = [pf("c.ts"), pf("a.ts"), pf("b.test.ts"), pf("b.ts")];
    const out = toGroupedFiles(allGroups({ core: ["b.ts", "a.ts", "c.ts"], tests: ["b.test.ts"] }), files);
    expect(out.map((g) => g.role)).toEqual(ROLES);
    expect(out[0]!.files.map((f) => f.path)).toEqual(["c.ts", "a.ts", "b.ts"]);
    expect(out[1]!.files.map((f) => f.path)).toEqual(["b.test.ts"]);
  });

  it("returns the PrFile objects themselves (patch and counts intact)", () => {
    const files = [{ path: "a.ts", additions: 9, deletions: 4, patch: "@@ -1 +1 @@\n+x" }];
    const out = toGroupedFiles(allGroups({ core: ["a.ts"] }), files);
    expect(out[0]!.files[0]).toBe(files[0]);
  });

  it("skips a server path that is not in `files`", () => {
    const out = toGroupedFiles(allGroups({ core: ["a.ts", "ghost.ts"] }), [pf("a.ts")]);
    expect(out.flatMap((g) => g.files.map((f) => f.path))).toEqual(["a.ts"]);
  });

  it("appends a PrFile missing from every group to core, so nothing is dropped", () => {
    const files = [pf("a.ts"), pf("late.md"), pf("raced.ts")];
    const out = toGroupedFiles(allGroups({ core: ["a.ts"], docs: [] }), files);
    expect(out.find((g) => g.role === "core")!.files.map((f) => f.path)).toEqual(["a.ts", "late.md", "raced.ts"]);
    expect(out.flatMap((g) => g.files)).toHaveLength(3);
  });

  it("creates a core group when the server sent none and files are orphaned", () => {
    const out = toGroupedFiles([group("docs", "a.md")], [pf("a.md"), pf("orphan.ts")]);
    expect(out[0]).toMatchObject({ role: "core" });
    expect(out[0]!.files.map((f) => f.path)).toEqual(["orphan.ts"]);
    expect(out.find((g) => g.role === "docs")!.files.map((f) => f.path)).toEqual(["a.md"]);
  });

  it("places a path listed in two groups only once", () => {
    const out = toGroupedFiles(allGroups({ core: ["a.ts"], tests: ["a.ts"] }), [pf("a.ts")]);
    expect(out.flatMap((g) => g.files)).toHaveLength(1);
  });
});

describe("filesWithFindings", () => {
  it("counts files, not findings: 2 findings in 1 file → 1; 5 findings in 2 files → 2", () => {
    const files = [{ path: "a.ts" }, { path: "b.ts" }, { path: "c.ts" }];
    expect(filesWithFindings(files, [{ file: "a.ts" }, { file: "a.ts" }])).toBe(1);
    expect(
      filesWithFindings(files, [{ file: "a.ts" }, { file: "a.ts" }, { file: "a.ts" }, { file: "b.ts" }, { file: "b.ts" }]),
    ).toBe(2);
  });

  it("ignores findings of files outside the group and returns 0 without findings", () => {
    expect(filesWithFindings([{ path: "a.ts" }], [{ file: "elsewhere.ts" }])).toBe(0);
    expect(filesWithFindings([{ path: "a.ts" }], [])).toBe(0);
  });
});
