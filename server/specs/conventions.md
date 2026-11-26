# Spec — repo conventions extraction

> **Status: implemented** (module `modules/conventions/`, client `client/src/app/repos/[repoId]/conventions/`). Refs are `server/src/…` unless prefixed.

The user scans a cloned, indexed repo for house-rules ("conventions"), sees each one with evidence from the code (file path + snippet), accepts / rejects / edits each, then turns the accepted ones into a skill (`type: convention`, `source: extracted`) through a modal where name, description and body are editable. Skills reach review prompts through the existing agent links (`reviewer-core/src/prompt.ts`, `## Skills / rules`).

## Building blocks already in the starter

| Piece | Where |
|---|---|
| `conventions` table | `db/schema/knowledge.ts:31` |
| `ConventionCandidate` contract (+ client copy) | `vendor/shared/contracts/knowledge.ts:226`, `client/src/vendor/shared/contracts/knowledge.ts` |
| Ranked file sample, no tests/configs/migrations, no LLM | `repoIntel.getConventionSamples` — `modules/repo-intel/service.ts:630`, filter `JUNK_PATH_PATTERNS` `:711` |
| Per-feature model `conventions` | `vendor/shared/contracts/platform.ts:74`, `resolveFeatureModel` — `modules/settings/feature-models.ts` |
| Skill CRUD, `defaultTrusted('extracted') === true` | `modules/skills/service.ts`, `modules/skills/helpers.ts` |
| Untrusted-data wrapper | `wrapUntrusted` — `platform/prompt.ts` (re-export of `reviewer-core/src/prompt.ts`) |
| Contained file read from the clone | `GitClient.readFile` — `adapters/git/simple-git.ts:267` |
| Async jobs | `JobRunner` — `platform/jobs.ts`; handler registration pattern `modules/repo-intel/service.ts:173` |
| Mock LLM per schema | `MockLLMProvider.structuredBySchema` — `adapters/mocks.ts:51` |
| UI strings, sidebar highlight | `client/messages/en/conventions.json`, `client/src/components/app-shell/helpers.ts:31` |

## Data model

- **CV-1** `conventions` gains `status` (`pending | accepted | rejected`, default `pending`), `skill_id` (nullable FK → `skills.id`, `ON DELETE SET NULL`) and `created_at`, and loses `accepted`. Index `(repo_id, status)` (`db/schema/knowledge.ts`). Migrations `0012` (add) and `0013` (drop `accepted`) — two steps because `drizzle-kit generate` asks an interactive rename question when one change both adds and drops columns.
- **CV-2** Derived states: `pending` — awaiting a decision; `accepted ∧ skill_id = null` — offered in the create-skill modal; `accepted ∧ skill_id ≠ null` — already in a skill, excluded from the modal; `rejected` — kept for stats and the re-scan prompt.
- **CV-3** Deleting a skill sets `skill_id = null` on its conventions (FK), so they become available for a new skill without extra code.
- **CV-4** Rows are never deleted except `pending` rows on re-scan (CV-12).
- **CV-4a** `evidence_sha`, `evidence_line_start`, `evidence_line_end` (nullable, migration `0014`) — the repo's `repo_index_state.last_indexed_sha` at scan time and the snippet's 1-based inclusive line range. Rows grounded before `0014` have them null.

## Contracts (`vendor/shared/contracts/knowledge.ts`, mirrored into the client copy)

- `ConventionStatus`; `ConventionCandidate { id, rule, evidence_path, evidence_snippet, evidence_lines: {start,end} | null, evidence_url: string | null, confidence, status, skill_id, created_at }`.
- `ConventionScanState { status: queued|running|done|failed, error, error_code, started_at, finished_at }`; `error_code` (`ConventionScanErrorCode`: `not_indexed | no_readable_files | llm_failed | timeout | interrupted | unknown`) is set only when `failed`.
- `ConventionStats { accepted, rejected, in_skills }`.
- `ConventionsResponse { scan: ConventionScanState | null, items, stats }`.
- `UpdateConventionInput { rule?, status? }`; `AttachConventionsInput { skill_id, ids }`.
- LLM schema: `ConventionExtraction { conventions: { rule, evidence_path, evidence_snippet, confidence }[] }` — the schema name matches the mock's `structuredBySchema` key.
- `CreateSkillInput.source` adds `'extracted'`; new optional `evidence_files: string[]`, persisted to `skills.evidence_files`.

## API (`modules/conventions`, onion layering)

| Route | Behaviour |
|---|---|
| `GET /repos/:repoId/conventions` | `ConventionsResponse` |
| `POST /repos/:repoId/conventions/scan` | `202 { jobId }`; `409` while a non-stale scan is active for the repo |
| `PATCH /conventions/:id` | edit `rule` and/or `status`; `404` outside workspace; `409` when `skill_id` is set |
| `POST /repos/:repoId/conventions/attach` | sets `skill_id` on the given `accepted ∧ skill_id = null` rows; idempotent |

- **CV-5** All routes are workspace-scoped through `getContext`; repo must belong to the workspace, else 404.
- **CV-6** The module does not import `modules/skills/*`. It touches `skills` only through the FK and one read (`ConventionsRepository.skillExists`) that checks the attach target belongs to the workspace. The feature model comes through `Container.resolveFeatureModel`, so the module does not import `modules/settings/*` either.

## Scan job (`conventions.scan`)

- **CV-7** The scan runs as a `JobRunner` job with `retries: 0` and a 180 s timeout (`constants.ts`). `JobRunner.enqueue` takes `opts?: { retries?, timeoutMs? }` (`platform/jobs.ts`); existing callers keep 2 retries / 120 s. Reason: a retried LLM failure would triple the cost. The timeout marks the job failed but does not abort the handler (`withTimeout` only races), so a slow scan may still write its result afterwards. `startScan` swallows the job's `done` rejection; the outcome lives on the `jobs` row.
- **CV-8** `scan` in the GET response is the latest `jobs` row with `kind='conventions.scan'` and `payload.repoId = repoId`. A `running` row older than timeout + 30 s, or a `queued` row older than 10 min (the queue is shared with indexing), is reported as `failed` with `error: 'interrupted'` (`helpers.ts` `isStaleJob`) and does not block a new scan — `jobs` rows are not reaped on boot (`reapStaleRuns` covers `agent_runs` only, `modules/reviews/service.ts:93`).
- **CV-9** Steps — exactly **one** LLM call per scan; files are chosen by code:
  1. `getConventionSamples(repoId, 40)` (ranked, no tests/configs/migrations); empty ⇒ fail with `SCAN_ERRORS.not_indexed`, no LLM call.
  2. `diversifyPaths(sample, 8)`: rank order, at most `MAX_PER_DIR` (2) files per directory, leftover slots filled by rank.
  3. Read each file with `git.readFile`; the prompt gets the first 12 000 chars of each (`FILE_CHAR_CAP`), grounding checks the full file; unreadable files are skipped, none readable ⇒ fail with `SCAN_ERRORS.no_readable_files`.
  4. Model from `resolveFeatureModel(…, 'conventions')`; `ConventionExtraction` over the files plus the known-rules block (CV-11). Any failure from model resolution to the answer is rethrown as `"Model call failed: <cause>"` (`SCAN_ERRORS.llm_failed`).
  5. Grounding (CV-10).
  6. In one transaction: delete the repo's `pending` rows, insert the grounded candidates as `pending` with `evidence_sha = last_indexed_sha` (null when the repo has no index state).
- **CV-10 Grounding** (code only, no LLM). A candidate survives only if `evidence_path` is one of the files read in step 3 and `evidence_snippet` occurs in that file (whitespace-normalized); `locateSnippet` returns the line range from the same normalized match. Confidence is clamped to 0..1. Empty rules are dropped, and so is a repeat of a known convention or of an earlier candidate: same evidence (path + normalized snippet), or rule content words (lowercase, stop words removed) with Jaccard ≥ `RULE_SIMILARITY` (0.8) (`groundCandidates`).
- **CV-11 Known rules.** The extraction prompt carries the text of every `accepted` and `rejected` rule of the repo (edited text where edited), labelled by status, with no snippets and no count limit, instructing the model not to propose them again or rephrase them. Repo files and known rules are wrapped with `wrapUntrusted`. A rephrasing that slips through is caught by CV-10 when it reuses the evidence or most of the words.
- **CV-11a Evidence link.** `evidence_url = https://github.com/<owner>/<name>/blob/<evidence_sha>/<path>#L<start>[-L<end>]` (path segments URL-encoded), built in `toConventionDto`; null without `evidence_sha`.
- **CV-11b Error codes.** `toScanState` maps `jobs.error` to `error_code` by prefix: `SCAN_ERRORS.*` → its key, `TimeoutError` ("Operation timed out…") → `timeout`, `interrupted` (CV-8) → `interrupted`, else `unknown`.
- **CV-12 Re-scan** replaces only `pending` rows; `accepted` (with or without `skill_id`) and `rejected` rows are kept.

## Skill creation

- **CV-13** The client builds the draft body from the accepted, unattached conventions the user selected in the modal (all by default): each rule, its `evidence_path`, and its full `evidence_snippet` in a fenced block (no truncation). Name, description and body are editable. Unselected conventions stay `accepted ∧ skill_id = null`, so several skills can be built from one repo's conventions.
- **CV-14** Save = `POST /skills { type: 'convention', source: 'extracted', evidence_files, … }` (trusted by default), then `POST …/conventions/attach`. The two calls are not atomic: if attach fails, the skill exists and the conventions stay available; the modal retries attach without re-creating the skill. A name clash is the existing `409` from `SkillsService.assertNameFree`.

## UI (`client/src/app/repos/[repoId]/conventions`)

- **CV-15** Sidebar item `conventions` in the SKILLS LAB group of `client/src/vendor/ui/nav.ts`, `href: /repos/:repoId/conventions`.
- **CV-16** Header shows `N accepted · M rejected · K in skills` from `stats`; Run extraction / Re-scan; states never-scanned, nothing new found, scanning, failed (message per `error_code`), load error. Strings live in `client/messages/en/conventions.json`.
- **CV-17** While `scan.status ∈ {queued, running}` the list query polls (`refetchInterval`); leaving and returning to the page restores the scanning state.
- **CV-18** Card: rule, `evidence_path:lines` linking to `evidence_url` (new tab), snippet, confidence, Accept / Reject / inline Edit; read-only once in a skill.
- **CV-19** Client code imports only types from `@devdigest/shared` (see `client/INSIGHTS.md`).

## Tests

- `server/test/conventions-helpers.test.ts` — grounding, `locateSnippet` line ranges, `diversifyPaths`, rule similarity, evidence/rephrase dedupe, `evidenceUrl`, `scanErrorCode`, stale-job rule, known rules inside `<untrusted>`.
- `server/test/conventions.it.test.ts` — mock LLM: scan → exactly one `ConventionExtraction` call, pending rows with lines + permalink; invented snippet / foreign path dropped; re-scan keeps accepted/rejected, puts them in the prompt and drops re-proposed and rephrased ones; unindexed repo → `not_indexed` without an LLM call; 409 on concurrent scan; stale job → interrupted and rescan allowed; one LLM call on failure (`retries: 0`, `llm_failed`); PATCH rules; idempotent attach; skill delete → `skill_id = null`.
- `server/test/skills.it.test.ts` — create with `source: 'extracted'` + `evidence_files`.
- Client RTL — `ConventionCard` (evidence link), `ConventionSkillModal` (subset selection, rebuild), `ConventionsView` (never / none-found / failed states), helpers.
- E2E — out of scope for now: the e2e stack has no LLM (`e2e/README.md:5`) and flows avoid mutations (`e2e/specs/coverage.md:16`).

## Verification

1. `server/`: `pnpm db:generate` → `pnpm db:migrate` → `pnpm typecheck` → `pnpm test`.
2. `client/`: `pnpm typecheck` → `pnpm test`; `reviewer-core/`: `npm run typecheck`.
3. Manual run via `./scripts/dev.sh` with a cheap `conventions` model in Settings (e.g. `openrouter` + `deepseek/deepseek-v4-flash`; Anthropic structured output can fail on newer models, see `server/INSIGHTS.md`): scan → cards with evidence → accept/reject/edit → modal → save → skill on `/skills` with `type: convention`, `source: extracted`; stats line updates; re-scan does not repeat known rules.
