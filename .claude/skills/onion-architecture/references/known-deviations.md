# Known deviations from `onion-architecture`

Existing code in `server/src/` that breaks the rules in [../SKILL.md](../SKILL.md). Don't copy these patterns and don't add rows. When a task already edits one of these files, move the offending code out first (boy-scout rule), then delete the row here. A bulk fix is a separate task.

Snapshot: 2026-11-23. The SKILL.md section 7 greps should return only these.

## Adapter / DB calls in route handlers (rules 1–2)

| File | What | Target |
|---|---|---|
| `modules/pulls/routes.ts` | Routes-only module: Drizzle queries (`container.db`, `drizzle-orm`, `db/schema`) and `container.github()` in handlers (`:28-47` sync, `:80-160` list, `:195-260` detail, `:292-340` comments) | `pulls/repository.ts` + `pulls/service.ts` |
| `modules/polling/routes.ts` | Routes-only: `container.db` + `container.github()` in the handler | `polling/service.ts` (+ repository or reuse `pulls` repo through a Container getter) |
| `modules/settings/routes.ts` | Routes-only: `container.db` reads/writes; Test-connection handler calls `secrets`, `github()`, `githubWithToken`, `llm()`, `llmWithKey`, `invalidateSecretCaches` (`:79-102`) | `settings/service.ts`. Keep the S11 order: verify the candidate key, then persist |
| `modules/workspace/routes.ts` | Routes-only, read-only: `container.db` query in the handler | `workspace/service.ts` + repository |
| `modules/repo-intel/routes.ts` | `container.repoIntel.getIndexState` (`:39`) and `container.jobs.enqueue` (`:52`) in handlers | Methods on `RepoIntelService` |

## Drizzle outside repositories (rule 3)

| File | What | Target |
|---|---|---|
| `modules/settings/feature-models.ts` | Runs a `settings` query (`:42-44`) | Settings repository |
| `modules/reviews/run-executor.ts:5` | `import * as schema` for `typeof schema.repos.$inferSelect` | A `RepoRow` type in `db/rows.ts` |
| `modules/reviews/diff-loader.ts:4` | Same, for the row type | A `RepoRow` type in `db/rows.ts` |
| `modules/repos/helpers.ts:2` | Same, in `toRepoDto(row)` (`:109`) | A `RepoRow` type in `db/rows.ts` |

## Whole `Container` passed into services (rule 8)

`AgentsService` (`modules/agents/service.ts:54`), `RepoService` (`modules/repos/service.ts:32`), `ReviewService` (`modules/reviews/service.ts:33`), `RepoIntelService` (`modules/repo-intel/service.ts:104`), `ReviewRunExecutor` (`modules/reviews/run-executor.ts:44`), `loadDiff` (`modules/reviews/diff-loader.ts:13`). Accepted legacy shape. Don't convert one unless the task is about its constructor, and don't add new services in this shape.

## Pure adapter imports

The allowed imports from `adapters/astgrep`, `adapters/codeindex/extract` and `adapters/git/diff-parser` (in `repo-intel/service.ts`, `repo-intel/pipeline/{full,incremental}.ts`, `reviews/diff-loader.ts`) are covered by SKILL.md section 5's allow-list. They are not violations.
