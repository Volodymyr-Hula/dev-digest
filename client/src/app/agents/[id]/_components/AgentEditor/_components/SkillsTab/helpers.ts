import type { Skill } from "@devdigest/shared";

/** Skills sorted by name (= prompt order), filtered by name/description/tags. */
export function visibleSkills(skills: readonly Skill[], filter: string): Skill[] {
  const q = filter.trim().toLowerCase();
  return [...skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(
      (sk) => !q || `${sk.name} ${sk.description} ${sk.tags.join(" ")}`.toLowerCase().includes(q),
    );
}

/** Toggle `id` in the linked set, returning the new id list. */
export function toggleLink(linked: readonly string[], id: string, on: boolean): string[] {
  return on ? [...new Set([...linked, id])] : linked.filter((x) => x !== id);
}
