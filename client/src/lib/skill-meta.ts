/* skill-meta.ts — presentation constants for skills shared by /skills and the
   agent editor's Skills tab. */
import type { SkillType } from "@devdigest/shared";

/** Skill type → badge colour (matches the Skills Lab design). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "var(--text-secondary)",
};

/** Badge background for a skill type colour (CSS variables get the neutral bg). */
export function skillTypeBg(type: SkillType): string {
  const c = SKILL_TYPE_COLOR[type];
  return c.startsWith("#") ? c + "1a" : "var(--bg-hover)";
}

/** Selectable skill types, in display order. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Kebab-case skill name — mirrors `SkillName` in `@devdigest/shared`. Client
 *  code may import only TYPES from `@devdigest/shared`: its barrel re-exports
 *  with `.js` specifiers that Next's bundler cannot resolve at runtime. */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;

export function isValidSkillName(name: string): boolean {
  return name.length <= SKILL_NAME_MAX && SKILL_NAME_RE.test(name);
}
