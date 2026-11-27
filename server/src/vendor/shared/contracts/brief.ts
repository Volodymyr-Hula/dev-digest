import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- PR intent layer (why a PR exists; feeds the reviewer prompt) ----
export const IntentClass = z.enum([
  'feature',
  'bugfix',
  'refactor',
  'performance',
  'security',
  'docs',
  'tests',
  'dependencies',
  'infra',
  'chore',
  'revert',
  'unknown',
]);
export type IntentClass = z.infer<typeof IntentClass>;

export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'title',
  'description',
  'linked_issue',
  'ticket_key',
  'plan_doc',
  'spec_doc',
  'branch',
  'commits',
  'paths',
  'diff_stats',
  'external_link',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  role: z.enum(['target', 'background']).optional(),
  status: z.enum(['used', 'truncated', 'not_found', 'referenced_not_fetched', 'skipped_pull_request']),
  version: z.enum(['pr_head', 'default_branch']).optional(),
  chars: z.number().int().optional(),
  reason: z.string().optional(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/**
 * Classifier LLM output. No min/max/length constraints (strict json_schema
 * compatibility; caps are applied in code) and no confidence field
 * (confidence is computed from the sources, never taken from the model).
 */
export const IntentClassification = z.object({
  intent_class: IntentClass,
  summary: z.string(),
  rationale: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

/** Stored + served PR intent. `intent` holds the summary text. */
export const PrIntent = Intent.extend({
  pr_id: z.string(),
  intent_class: IntentClass,
  rationale: z.string(),
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
  source: z.enum(['model', 'user']),
  head_sha: z.string().nullable(),
  stale: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  cost_usd: z.number().nullable(),
  updated_at: z.string(),
});
export type PrIntent = z.infer<typeof PrIntent>;

export const PrIntentUpdate = z.object({
  intent_class: IntentClass,
  intent: z.string().min(1).max(600),
  in_scope: z.array(z.string().max(200)).max(8).default([]),
  out_of_scope: z.array(z.string().max(200)).max(8).default([]),
});
export type PrIntentUpdate = z.infer<typeof PrIntentUpdate>;

export const PrIntentResponse = z.object({ intent: PrIntent.nullable() });
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
