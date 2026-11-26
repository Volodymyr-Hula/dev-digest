# Insights — server

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->
- **Treat `repo_index_state.last_indexed_sha = ''` as "no commit"** — the indexer inserts the row with an empty-string placeholder before its first commit lands (`src/modules/repo-intel/service.ts:199`), and the column is `NOT NULL`, so `?? fallback` never fires; normalize with `|| null` (as `ConventionsRepository.getRepo` does) before building links or diffs from it. (2026-11-24)

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->
- **Split a schema change that adds AND drops columns on one table into two `pnpm db:generate` runs (add first, drop second)** — drizzle-kit asks "is this a rename?" for every added column and, without a TTY (agent shell, CI), fails with `Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false)`. Keep the old column in the schema for the first run, remove it for the second. Evidence: `src/db/migrations/0012_broken_night_thrasher.sql` + `0013_windy_lilandra.sql` (conventions `accepted` → `status`). (2026-11-24)
- **List a zip's entries with fflate `unzipSync(bytes, { filter: (f) => { …; return false } })`, then inflate only the chosen entry with the streaming `Unzip` fed in 4 KB slices (`inflateEntryCapped`)** — a filter returning false skips decompression, so an archive's scripts/assets are never inflated; a throw inside the filter aborts the scan (entry-count cap). Never trust `f.originalSize` as the limit: it is a header field the archive author sets, and `unzipSync` would inflate a lying entry in one allocation; the streaming path aborts once the output passes the cap. Evidence: `src/modules/skills/import.ts` `extractSkillFromArchive`, `inflateEntryCapped`; `test/skills-import.test.ts` "stops inflating a zip bomb". (2026-11-24)
- **Treat `db.execute(sql…)` as an array of rows (`Array.from(rows, …)`), not `{ rows }`** — with the `postgres-js` driver (`db/client.ts`) Drizzle returns postgres' `RowList`, so the node-postgres `.rows` shape is undefined. Evidence: `src/modules/skills/repository.ts` `distinctTags`; covered by `test/skills.it.test.ts` "lists distinct tags". (2026-11-24)

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **Check `agent_runs.provider` before blaming OpenRouter for a `400 {"type":"error",…,"request_id":"req_…"}`** — that body shape is the Anthropic SDK talking to Anthropic directly, i.e. the agent was on `provider=anthropic`. `tool_choice: type "tool" and "any" are not supported for this model.` comes from `AnthropicProvider.completeStructured` forcing `tool_choice: {type:'tool'}`, which Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1+ reject (they also reject non-default `temperature`, which the adapter sends as 0). Fix: `output_config.format` json_schema instead of a forced tool; SDK `@anthropic-ai/sdk` 0.33.1 predates it. Evidence: `src/adapters/llm/anthropic.ts:107,115`; `select provider, model, error from agent_runs order by ran_at desc`. (2026-11-20)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-24 — pr-self-review fixes (fetcher port, connect-time SSRF check, capped inflate, name-clash 409) → corrected the fflate zip entry.
- 2026-11-24 — conventions: one LLM call, GitHub evidence links, re-scan dedupe, error codes; API Contract Reviewer seed → empty-string `last_indexed_sha` placeholder.
- 2026-11-24 — repo conventions (scan job, grounding, accept/reject, skill from conventions) → drizzle-kit add+drop split; open question on unhandled `job.done` rejections.
- 2026-11-24 — skill import (URL/file/zip), active version → fflate list-without-inflate pattern.
- 2026-11-24 — skills module + prompt injection → postgres-js `execute` result shape.
- 2026-11-20 — diagnosed `tool_choice` 400 on a review run → Anthropic-adapter forced-tool error entry.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
- **Does a failed clone/index job crash the API with an unhandled rejection?** — `JobRunner.enqueue` returns `done` (the p-queue promise) which rethrows on failure (`src/platform/jobs.ts`), and no caller attaches a handler (`grep -rn "\.done" src` → only `modules/conventions/service.ts`, which swallows it). Node's default `--unhandled-rejections=throw` would exit; not reproduced. (2026-11-24)
