import type { ConventionCandidate } from "@devdigest/shared";
import { SKILL_NAME_MAX } from "@/lib/skill-meta";

const LANG_BY_EXT: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js", py: "python", go: "go",
  rs: "rust", java: "java", kt: "kotlin", rb: "ruby", php: "php", cs: "csharp", swift: "swift",
  sql: "sql", sh: "bash", css: "css", scss: "scss", html: "html", vue: "vue", svelte: "svelte",
  json: "json", yml: "yaml", yaml: "yaml", md: "md",
};

export function langForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANG_BY_EXT[ext] ?? "";
}

/** A backtick fence longer than any backtick run inside the snippet. */
export function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((m) => m.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** Skill body: one bullet per rule with its evidence path and the full snippet. */
export function buildSkillBody(
  heading: string,
  evidenceLabel: string,
  conventions: readonly ConventionCandidate[],
): string {
  const parts = [`# ${heading}`, ""];
  for (const c of conventions) {
    const fence = fenceFor(c.evidence_snippet);
    parts.push(
      `- ${c.rule}`,
      `  ${evidenceLabel}: \`${c.evidence_path}\``,
      "",
      `  ${fence}${langForPath(c.evidence_path)}`,
      ...c.evidence_snippet.split("\n").map((l) => (l ? `  ${l}` : "")),
      `  ${fence}`,
      "",
    );
  }
  return parts.join("\n").trimEnd() + "\n";
}

/** Unique evidence paths, in order. */
export function evidenceFiles(conventions: readonly ConventionCandidate[]): string[] {
  return [...new Set(conventions.map((c) => c.evidence_path).filter(Boolean))];
}

/** `owner/My Repo` → `my-repo-conventions` (a valid `SkillName`). */
export function suggestSkillName(repoFullName: string | null | undefined): string {
  const base = (repoFullName?.split("/").pop() ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = "conventions";
  if (!base) return suffix;
  return `${base.slice(0, SKILL_NAME_MAX - suffix.length - 1).replace(/-+$/, "")}-${suffix}`;
}
