# server — `@devdigest/api`

## Map

| Path | What |
|------|------|
| `src/server.ts` | process entry: config, listen, graceful shutdown |
| `src/app.ts` | `buildApp()` — plugins, host/origin guard, error handler, stale-run reaper, module registration |
| `src/modules/index.ts` | static module registry |
| `src/modules/<name>/` | feature module: `routes.ts` (Fastify plugin) → `service.ts` → `repository.ts`, plus `helpers.ts` / `constants.ts` |
| `src/modules/_shared/` | request context + shared route schemas |
| `src/platform/` | `container.ts` (DI composition root), config, jobs (p-queue + `jobs` table), SSE run bus, errors, local-only guard |
| `src/adapters/` | port implementations (LLM, GitHub, git, ast-grep, depgraph, tokenizer, secrets) + `mocks.ts` |
| `src/db/` | `schema/*.ts` (Drizzle), `migrations/`, `migrate.ts`, `seed.ts` |
| `src/vendor/shared/` | `@devdigest/shared` — the source of truth for contracts |
| `test/` | vitest suites |

## Stack (server-only)

Fastify 5 + `fastify-type-provider-zod` · Drizzle ORM 0.45 / drizzle-kit 0.31 / `postgres` 3 · octokit 4 · openai 4 · `@anthropic-ai/sdk` 0.33 · `@ast-grep/napi` 0.43 (exact pin) · dependency-cruiser 17 · graphology · js-tiktoken · p-queue 8 · testcontainers 10.

## Conventions

- Relative imports carry the `.js` suffix (`'./service.js'`).
- New module: create `modules/<name>/routes.ts` exporting a Fastify plugin, then add one import + one entry in `src/modules/index.ts`. Registration is static.
- Reach other modules and adapters through `Container` getters (`agentsRepo`, `reviewRepo`, `repoIntel`, `llm()`, `github`, `git`). Keep imports inside your own module folder.
- Validate with zod schemas on the route `schema` (`withTypeProvider<ZodTypeProvider>()`); the handler receives already-parsed input.
- Throw `AppError` subclasses from `src/platform/errors.ts`; the global handler maps them to the error envelope.
- Read secrets only via `SecretsProvider` (`container.secrets`); `AppConfig` holds non-secret config.

## Gotchas

- `src/platform/{grounding,structured,prompt}.ts` are re-exports of `reviewer-core`; change the logic in `reviewer-core/src`.
- The DB schema already holds tables for future milestones (eval, ci, plugins, onboarding, …). Empty tables are expected; keep them.
- Duplicate zod module instances make `instanceof ZodError` unreliable; match by shape, as `app.ts` does.
- `reapStaleRuns` on boot marks every `running` run as orphaned — valid only with a single API instance per DB.
- The global rate limit is off under `NODE_ENV=test`; per-route limits still apply.
- `pulls`, `polling`, `settings`, `workspace` are legacy routes-only modules (DB and adapter calls inline in `routes.ts`). Don't copy them. A new module or handler follows the `onion-architecture` skill, and an edited legacy handler moves its calls into a service first.

## Pointers

- Read before adding or changing a route, service, repository, adapter, port or Container getter: `onion-architecture` skill ([../.claude/skills/onion-architecture/SKILL.md](../.claude/skills/onion-architecture/SKILL.md))

- Read when you need the API map, env vars or the request flow diagram: [README.md](README.md)
- Read when touching indexing or the `repoIntel` facade: [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md)
- Read when changing prompt assembly, grounding or the review pipeline: [../reviewer-core/CLAUDE.md](../reviewer-core/CLAUDE.md)
- Read when writing or running tests: [../TESTING.md](../TESTING.md)
- Read when you need the boot order, DI container/overrides, adapters and mocks, module layering, `JobRunner`, the SSE run bus or why the host/origin guard exists: [docs/architecture.md](docs/architecture.md)
- Read when changing the review cycle (run creation, executor, grounding, scoring, persistence, cancel/reaper, SSE, cost): [specs/review-flow.md](specs/review-flow.md)
- Read when changing repo import, PR sync/polling, PR detail or the `needs_review`/`reviewed`/`stale` status: [specs/pr-import.md](specs/pr-import.md)
- Read when changing convention extraction (scan job, grounding, accept/reject, skill from conventions): [specs/conventions.md](specs/conventions.md)
- Read when changing error handling, status codes, the host/origin guard, rate limits or health routes: [specs/api-error-envelope.md](specs/api-error-envelope.md)
- Read before starting work here and update at the end of the task, via the `engineering-insights` skill: [INSIGHTS.md](INSIGHTS.md)
