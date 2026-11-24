import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isSkillConfigChange } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; reads `agent_skills`
 * only to count linked agents (the agents module owns the link side).
 * Workspace-scoped throughout.
 */

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  tags: string[];
  trusted: boolean;
  enabled: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  tags?: string[];
  trusted?: boolean;
  enabled?: boolean;
}

export interface SkillWithCount {
  row: SkillRow;
  agentCount: number;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  private agentCount() {
    return sql<number>`(select count(*)::int from ${t.agentSkills} where ${t.agentSkills.skillId} = ${t.skills.id})`;
  }

  async list(workspaceId: string): Promise<SkillWithCount[]> {
    const rows = await this.db
      .select({ row: t.skills, agentCount: this.agentCount() })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows;
  }

  async getById(workspaceId: string, id: string): Promise<SkillWithCount | undefined> {
    const [row] = await this.db
      .select({ row: t.skills, agentCount: this.agentCount() })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** True when another skill in the workspace already uses `name`. */
  async nameTaken(workspaceId: string, name: string, excludeId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.name, name),
          ...(excludeId ? [ne(t.skills.id, excludeId)] : []),
        ),
      );
    return row !== undefined;
  }

  /** Distinct tags used across the workspace's skills, alphabetically. */
  async distinctTags(workspaceId: string): Promise<string[]> {
    const rows = await this.db.execute(
      sql`select distinct unnest(${t.skills.tags}) as tag from ${t.skills} where ${t.skills.workspaceId} = ${workspaceId} order by tag`,
    );
    return Array.from(rows, (r) => String((r as { tag: unknown }).tag));
  }

  /** Insert a skill AND record version 1 in skill_versions. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...values, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx.insert(t.skillVersions).values(snapshot(row!));
      return row!;
    });
  }

  /**
   * Update a skill; a config change (anything but `enabled`) records a new
   * version = max(existing versions) + 1 and makes it active. `max`, not
   * `version + 1`: after an older version was activated, `version` is not the
   * newest one.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
      if (!existing) return undefined;

      const configChanged = isSkillConfigChange(existing, patch);
      const nextVersion = configChanged ? (await latestVersion(tx, id)) + 1 : existing.version;
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.trusted !== undefined ? { trusted: patch.trusted } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(configChanged ? { version: nextVersion } : {}),
        })
        .where(eq(t.skills.id, id))
        .returning();
      if (configChanged && row) await tx.insert(t.skillVersions).values(snapshot(row));
      return row;
    });
  }

  /**
   * Make an existing version active: copy its snapshot into the skill row. No
   * new version is recorded; `enabled` is not versioned and stays as is.
   * Undefined when the skill (in this workspace) or the version is missing.
   */
  async activateVersion(workspaceId: string, id: string, version: number): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [snap] = await tx
        .select()
        .from(t.skillVersions)
        .innerJoin(t.skills, eq(t.skills.id, t.skillVersions.skillId))
        .where(
          and(
            eq(t.skills.workspaceId, workspaceId),
            eq(t.skillVersions.skillId, id),
            eq(t.skillVersions.version, version),
          ),
        );
      if (!snap) return undefined;
      const v = snap.skill_versions;
      const [row] = await tx
        .update(t.skills)
        .set({
          name: v.name,
          description: v.description,
          type: v.type,
          tags: v.tags,
          trusted: v.trusted,
          body: v.body,
          version: v.version,
        })
        .where(eq(t.skills.id, id))
        .returning();
      return row;
    });
  }

  /** Delete (versions + agent links cascade). False if not in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function latestVersion(tx: Tx, skillId: string): Promise<number> {
  const [r] = await tx
    .select({ max: sql<number>`coalesce(max(${t.skillVersions.version}), 0)::int` })
    .from(t.skillVersions)
    .where(eq(t.skillVersions.skillId, skillId));
  return r?.max ?? 0;
}

function snapshot(row: SkillRow) {
  return {
    skillId: row.id,
    version: row.version,
    name: row.name,
    description: row.description,
    type: row.type,
    tags: row.tags,
    trusted: row.trusted,
    body: row.body,
  };
}
