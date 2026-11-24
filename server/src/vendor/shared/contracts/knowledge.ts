import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'imported_file', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  // Free-form labels, normalized (trimmed, lowercased, deduped). Own set per skill.
  tags: z.array(z.string()).default([]),
  // Trusted skills go into the prompt verbatim; untrusted ones (imported from a
  // URL / community by default) are delimiter-wrapped as DATA. User-toggleable.
  trusted: z.boolean().default(true),
  // Number of agents this skill is linked to (agent_skills).
  agent_count: z.number().int().default(0),
});
export type Skill = z.infer<typeof Skill>;

/** Skill name: kebab-case slug, unique per workspace. */
export const SkillName = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use kebab-case: lowercase letters, digits and dashes');

/** A tag as sent by a client; the server normalizes (trim + lowercase + dedupe). */
export const SkillTag = z.string().trim().min(1).max(32);

export const CreateSkillInput = z.object({
  name: SkillName,
  description: z.string().max(500).default(''),
  type: SkillType,
  body: z.string().min(1),
  tags: z.array(SkillTag).max(20).default([]),
  enabled: z.boolean().optional(),
  // Omitted → the server's default for the source (imported → untrusted).
  trusted: z.boolean().optional(),
  source: z.enum(['manual', 'imported_url', 'imported_file', 'extracted']).default('manual'),
  /** Repo files the skill was derived from (`extracted` skills). */
  evidence_files: z.array(z.string().min(1)).max(100).optional(),
});
export type CreateSkillInput = z.input<typeof CreateSkillInput>;

/** Where an import comes from. A file is sent base64-encoded (.md/.markdown or a .zip/.skill archive). */
export const SkillImportRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url'), url: z.string().url().max(2000) }),
  z.object({
    kind: z.literal('file'),
    filename: z.string().min(1).max(255),
    content_base64: z.string().min(1),
  }),
]);
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

/** Parsed, not yet saved import. The client lets the user edit `draft`, then POSTs it to /skills. */
export const SkillImportPreview = z.object({
  draft: z.object({
    name: z.string(),
    description: z.string(),
    type: SkillType,
    tags: z.array(z.string()),
    body: z.string(),
    source: z.enum(['imported_url', 'imported_file']),
  }),
  warnings: z.array(z.string()),
  // Archive entries that were not used (scripts, references, assets) — listed, never read or run.
  ignored_files: z.array(z.string()),
  name_taken: z.boolean(),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const UpdateSkillInput = z.object({
  name: SkillName.optional(),
  description: z.string().max(500).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  tags: z.array(SkillTag).max(20).optional(),
  enabled: z.boolean().optional(),
  trusted: z.boolean().optional(),
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;

/** Immutable snapshot of a skill's config at one version (everything but `enabled`). */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  tags: z.array(z.string()),
  trusted: z.boolean(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** A house-rule extracted from a repo, grounded in a file path + code snippet. */
export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  /** Set once the convention went into a skill; null again if that skill is deleted. */
  skill_id: z.string().nullable(),
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** State of the latest conventions scan job for a repo. */
export const ConventionScanState = z.object({
  status: z.enum(['queued', 'running', 'done', 'failed']),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export type ConventionScanState = z.infer<typeof ConventionScanState>;

export const ConventionStats = z.object({
  accepted: z.number().int(),
  rejected: z.number().int(),
  in_skills: z.number().int(),
});
export type ConventionStats = z.infer<typeof ConventionStats>;

export const ConventionsResponse = z.object({
  scan: ConventionScanState.nullable(),
  items: z.array(ConventionCandidate),
  stats: ConventionStats,
});
export type ConventionsResponse = z.infer<typeof ConventionsResponse>;

export const UpdateConventionInput = z
  .object({
    rule: z.string().trim().min(1).max(2000).optional(),
    status: ConventionStatus.optional(),
  })
  .refine((v) => v.rule !== undefined || v.status !== undefined, 'Nothing to update');
export type UpdateConventionInput = z.infer<typeof UpdateConventionInput>;

/** Mark accepted conventions as included in a just-created skill. */
export const AttachConventionsInput = z.object({
  skill_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(500),
});
export type AttachConventionsInput = z.infer<typeof AttachConventionsInput>;

/** LLM step 1: pick representative files from the ranked sample. */
export const ConventionFileSelection = z.object({
  paths: z.array(z.string()),
});
export type ConventionFileSelection = z.infer<typeof ConventionFileSelection>;

/** LLM step 2: conventions with evidence from the files read. */
export const ConventionExtraction = z.object({
  conventions: z.array(
    z.object({
      rule: z.string(),
      evidence_path: z.string(),
      evidence_snippet: z.string(),
      confidence: z.number(),
    }),
  ),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // Number of skills linked to this agent (agent_skills).
  skill_count: z.number().int().default(0),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
