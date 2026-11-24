# Insights — server

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->
- **List a zip's entries with fflate `unzipSync(bytes, { filter: (f) => { …; return false } })`, then decompress only the chosen entry with a second `filter`** — a filter returning false skips decompression, so an archive's scripts/assets are never inflated and `f.originalSize` can be checked first; a throw inside the filter aborts the scan (used for the entry-count cap). Evidence: `src/modules/skills/import.ts` `extractSkillFromArchive`; `test/skills-import.test.ts`. (2026-11-24)
- **Treat `db.execute(sql…)` as an array of rows (`Array.from(rows, …)`), not `{ rows }`** — with the `postgres-js` driver (`db/client.ts`) Drizzle returns postgres' `RowList`, so the node-postgres `.rows` shape is undefined. Evidence: `src/modules/skills/repository.ts` `distinctTags`; covered by `test/skills.it.test.ts` "lists distinct tags". (2026-11-24)

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **Check `agent_runs.provider` before blaming OpenRouter for a `400 {"type":"error",…,"request_id":"req_…"}`** — that body shape is the Anthropic SDK talking to Anthropic directly, i.e. the agent was on `provider=anthropic`. `tool_choice: type "tool" and "any" are not supported for this model.` comes from `AnthropicProvider.completeStructured` forcing `tool_choice: {type:'tool'}`, which Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1+ reject (they also reject non-default `temperature`, which the adapter sends as 0). Fix: `output_config.format` json_schema instead of a forced tool; SDK `@anthropic-ai/sdk` 0.33.1 predates it. Evidence: `src/adapters/llm/anthropic.ts:107,115`; `select provider, model, error from agent_runs order by ran_at desc`. (2026-11-20)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-24 — skill import (URL/file/zip), active version → fflate list-without-inflate pattern.
- 2026-11-24 — skills module + prompt injection → postgres-js `execute` result shape.
- 2026-11-20 — diagnosed `tool_choice` 400 on a review run → Anthropic-adapter forced-tool error entry.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
