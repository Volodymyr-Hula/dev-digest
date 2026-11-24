import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

const SKILL_TYPES = ['rubric', 'convention', 'security', 'custom'] as const;

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: SKILL_TYPES }).notNull(),
    source: text('source', {
      enum: ['manual', 'imported_url', 'imported_file', 'extracted', 'community'],
    }).notNull(),
    body: text('body').notNull(),
    // Free-form labels (normalized lowercase); each skill has its own set.
    tags: text('tags').array().notNull().default([]),
    // Untrusted skills are delimiter-wrapped as DATA in the review prompt.
    trusted: boolean('trusted').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
  },
  (t) => ({ nameUq: uniqueIndex('skills_workspace_name_uq').on(t.workspaceId, t.name) }),
);

/** Immutable config snapshot per skill version (everything but `enabled`). */
export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull().default(''),
    description: text('description').notNull().default(''),
    type: text('type', { enum: SKILL_TYPES }).notNull().default('custom'),
    tags: text('tags').array().notNull().default([]),
    trusted: boolean('trusted').notNull().default(true),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
