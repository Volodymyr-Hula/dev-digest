import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, tag normalization and
 * the version-bump rule. No I/O.
 */

/** Map a skill row (+ its linked-agent count) to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow, agentCount = 0): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    tags: row.tags,
    trusted: row.trusted,
    agent_count: agentCount,
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    tags: row.tags,
    trusted: row.trusted,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Trim + lowercase + dedupe (first occurrence wins), dropping empties. */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Skills from an outside source are untrusted by default — their body is
 * wrapped as DATA in the review prompt until a user marks them trusted.
 */
export function defaultTrusted(source: SkillSource): boolean {
  return source === 'manual' || source === 'extracted';
}

/** Fields whose change bumps the skill version (anything but `enabled`). */
export interface SkillConfigPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  tags?: string[];
  trusted?: boolean;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** True when the patch changes a versioned field relative to the existing row. */
export function isSkillConfigChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body' | 'tags' | 'trusted'>,
  patch: SkillConfigPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body) ||
    (patch.trusted !== undefined && patch.trusted !== existing.trusted) ||
    (patch.tags !== undefined && !sameTags(patch.tags, existing.tags))
  );
}
