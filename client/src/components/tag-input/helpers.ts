import { MAX_SUGGESTIONS, SUGGEST_MIN_CHARS } from "./constants";

/** Same normalization the server applies: trim + lowercase. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Add a tag if non-empty and not already present. */
export function addTag(tags: readonly string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  return tag && !tags.includes(tag) ? [...tags, tag] : [...tags];
}

/** Existing tags containing the draft (≥ SUGGEST_MIN_CHARS), minus picked ones;
 *  prefix matches first, then alphabetical. */
export function matchTags(draft: string, all: readonly string[], picked: readonly string[]): string[] {
  const q = normalizeTag(draft);
  if (q.length < SUGGEST_MIN_CHARS) return [];
  return all
    .filter((tag) => tag.includes(q) && !picked.includes(tag))
    .sort((a, b) => Number(b.startsWith(q)) - Number(a.startsWith(q)) || a.localeCompare(b))
    .slice(0, MAX_SUGGESTIONS);
}
