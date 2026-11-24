import type { SkillType } from "@devdigest/shared";
import { maxLen, required, skillName, type Rules } from "@/lib/validation";

/** The editable fields of a skill being created or imported. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  tags: string[];
  body: string;
}

/** Mirrors `CreateSkillInput` (`SkillName`, description max 500, body min 1). */
export const SKILL_DRAFT_RULES: Rules<SkillDraft> = {
  name: [required, skillName],
  description: [maxLen(500)],
  body: [required],
};

export const EMPTY_DRAFT: SkillDraft = { name: "", description: "", type: "custom", tags: [], body: "" };
