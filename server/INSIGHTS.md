# Insights — server

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->
- **Inject a failure in an it-test by `vi.spyOn(app.container.reviewRepo, …)`** — services built in Container getters hold the same repo instance, so spying on it reaches the service without an override slot. Evidence: `test/smart-diff.it.test.ts` FR-003 case; `src/platform/container.ts` `smartDiffService` getter. (2026-11-27)

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->
- **Don't rely on `pr_files` order being GitHub's order** — the table has no order column and `getPrFiles` has no `ORDER BY`, so "original order" is heap insertion order. Evidence: `src/modules/reviews/repository.ts:39`. (2026-11-27)
- **Give `agent_id = null` reviews their own bucket in any per-agent selection** — the seeded review has no `agent_id`/`run_id`, so a selector keyed on agent silently drops the seed findings. Evidence: `src/db/seed.ts` seeded review insert; `src/modules/smart-diff/helpers.ts` `selectLatestReviewPerAgent` (`r.agentId ?? null`). (2026-11-27)
- **Before adding a module repository, check `container.reviewRepo`** — `ReviewRepository` already exposes `getPull(workspaceId, prId)`, `getPrFiles(prId)` and `reviewsForPull(prId)`; depend on them through a local narrow interface in `<module>/types.ts` (onion rule 5 forbids importing `reviews/repository.ts`). Evidence: `src/modules/reviews/repository.ts:31,39,64`; `src/modules/smart-diff/types.ts` `SmartDiffReads`. (2026-11-27)
- **Don't treat `PullMeta.linked_issue` as a closing reference** — `resolveLinkedIssue` makes the keyword optional (`/(?:closes|fixes|resolves)?\s*#(\d+)/i`), so the first bare `#N` anywhere in the body wins, and it may be a PR. Evidence: `src/adapters/github/octokit.ts:128`. (2026-11-27)
- **Treat `repo_index_state.last_indexed_sha = ''` as "no commit"** — the indexer inserts the row with an empty-string placeholder before its first commit lands (`src/modules/repo-intel/service.ts:199`), and the column is `NOT NULL`, so `?? fallback` never fires; normalize with `|| null` (as `ConventionsRepository.getRepo` does) before building links or diffs from it. (2026-11-24)

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->
- **Edit `src/platform/model-router.ts` only via a byte-preserving shell edit (python/sed), not Edit/Write** — the file contains a NUL byte (`file` reports `data`), which makes Edit/Write refuse it. Evidence: `tr -cd '\000' < src/platform/model-router.ts | wc -c` → 1. (2026-11-27)
- **Split a schema change that adds AND drops columns on one table into two `pnpm db:generate` runs (add first, drop second)** — drizzle-kit asks "is this a rename?" for every added column and, without a TTY (agent shell, CI), fails with `Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false)`. Keep the old column in the schema for the first run, remove it for the second. Evidence: `src/db/migrations/0012_broken_night_thrasher.sql` + `0013_windy_lilandra.sql` (conventions `accepted` → `status`). (2026-11-24)
- **List a zip's entries with fflate `unzipSync(bytes, { filter: (f) => { …; return false } })`, then inflate only the chosen entry with the streaming `Unzip` fed in 4 KB slices (`inflateEntryCapped`)** — a filter returning false skips decompression, so an archive's scripts/assets are never inflated; a throw inside the filter aborts the scan (entry-count cap). Never trust `f.originalSize` as the limit: it is a header field the archive author sets, and `unzipSync` would inflate a lying entry in one allocation; the streaming path aborts once the output passes the cap. Evidence: `src/modules/skills/import.ts` `extractSkillFromArchive`, `inflateEntryCapped`; `test/skills-import.test.ts` "stops inflating a zip bomb". (2026-11-24)
- **Treat `db.execute(sql…)` as an array of rows (`Array.from(rows, …)`), not `{ rows }`** — with the `postgres-js` driver (`db/client.ts`) Drizzle returns postgres' `RowList`, so the node-postgres `.rows` shape is undefined. Evidence: `src/modules/skills/repository.ts` `distinctTags`; covered by `test/skills.it.test.ts` "lists distinct tags". (2026-11-24)

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **Use `safeParse` + a plain `Error` for a service-level response-shape guard, not `.parse`** — `app.ts` maps every ZodError to `422 validation_error`, so a broken response would look like a client mistake instead of `500 internal_error`. Evidence: `src/app.ts:157-158`; `src/modules/smart-diff/service.ts`; `test/smart-diff.it.test.ts` FR-003 case. (2026-11-27)
- **Check `agent_runs.provider` before blaming OpenRouter for a `400 {"type":"error",…,"request_id":"req_…"}`** — that body shape is the Anthropic SDK talking to Anthropic directly, i.e. the agent was on `provider=anthropic`. `tool_choice: type "tool" and "any" are not supported for this model.` comes from `AnthropicProvider.completeStructured` forcing `tool_choice: {type:'tool'}`, which Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1+ reject (they also reject non-default `temperature`, which the adapter sends as 0). Fix: `output_config.format` json_schema instead of a forced tool; SDK `@anthropic-ai/sdk` 0.33.1 predates it. Evidence: `src/adapters/llm/anthropic.ts:107,115`; `select provider, model, error from agent_runs order by ran_at desc`. (2026-11-20)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-27 — Smart Diff (`modules/smart-diff`, `GET /pulls/:id/smart-diff`) → reuse `reviewRepo` via local interface, null-agent bucket, `pr_files` order, parse→422 trap, container spy.
- 2026-11-27 — Intent Layer research + spec (`specs/intent-layer.md`) → model-router NUL byte; `linked_issue` is not a closing ref.
- 2026-11-26 — depcruise config for own code → open question on repo wiring in skills/conventions routes.
- 2026-11-24 — pr-self-review fixes (fetcher port, connect-time SSRF check, capped inflate, name-clash 409) → corrected the fflate zip entry.
- 2026-11-24 — conventions: one LLM call, GitHub evidence links, re-scan dedupe, error codes; API Contract Reviewer seed → empty-string `last_indexed_sha` placeholder.
- 2026-11-24 — repo conventions (scan job, grounding, accept/reject, skill from conventions) → drizzle-kit add+drop split; open question on unhandled `job.done` rejections.
- 2026-11-24 — skill import (URL/file/zip), active version → fflate list-without-inflate pattern.
- 2026-11-24 — skills module + prompt injection → postgres-js `execute` result shape.
- 2026-11-20 — diagnosed `tool_choice` 400 on a review run → Anthropic-adapter forced-tool error entry.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
- **Is `new XRepo(container.db)` in route setup allowed or a violation?** — `onion-architecture/SKILL.md` §1 forbids `repository.ts` imports in `routes.ts`, yet `modules/skills/routes.ts` and `modules/conventions/routes.ts` wire their repo that way and are absent from `references/known-deviations.md`; depcruise `routes-no-infra` flags them (now in `.dependency-cruiser-known-violations.json`). Decide, then fix the skill or the known-deviations list. Evidence: `server/.dependency-cruiser-known-violations.json` entries `from: src/modules/conventions/routes.ts`. (2026-11-26)
- **Does a failed clone/index job crash the API with an unhandled rejection?** — `JobRunner.enqueue` returns `done` (the p-queue promise) which rethrows on failure (`src/platform/jobs.ts`), and no caller attaches a handler (`grep -rn "\.done" src` → only `modules/conventions/service.ts`, which swallows it). Node's default `--unhandled-rejections=throw` would exit; not reproduced. (2026-11-24)
