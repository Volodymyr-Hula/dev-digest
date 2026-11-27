/** Pure helpers for the DiffTab. */
import type { SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";

export interface GroupedFiles {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Map the server's groups onto the PR's `PrFile`s. Each group keeps the server's
 * order of roles; its files are ordered by their index in `files` (Original
 * order). A path the server doesn't know is skipped; a `PrFile` missing from every
 * group (data raced a GitHub refresh) is appended to core, so nothing is dropped.
 */
export function toGroupedFiles(groups: SmartDiffGroup[], files: PrFile[]): GroupedFiles[] {
  const byPath = new Map(files.map((f, i) => [f.path, { file: f, index: i }]));
  const placed = new Set<string>();
  const out: GroupedFiles[] = groups.map((g) => {
    const members = g.files
      .map((sf) => byPath.get(sf.path))
      .filter((m): m is { file: PrFile; index: number } => !!m && !placed.has(m.file.path));
    for (const m of members) placed.add(m.file.path);
    return { role: g.role, files: members.sort((a, b) => a.index - b.index).map((m) => m.file) };
  });
  const orphans = files.filter((f) => !placed.has(f.path));
  if (orphans.length > 0) {
    const core = out.find((g) => g.role === "core");
    if (core) core.files = [...core.files, ...orphans];
    else out.unshift({ role: "core", files: orphans });
  }
  return out;
}

/** How many of `files` have at least one finding (files, not findings). */
export function filesWithFindings(files: { path: string }[], findings: { file: string }[]): number {
  const withFindings = new Set(findings.map((f) => f.file));
  return files.filter((f) => withFindings.has(f.path)).length;
}
