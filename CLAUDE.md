# DevDigest

Local-first AI pull-request review starter: import a PR, run an agent review, get grounded findings.

- Before the first plan or edit of any task, run the `engineering-insights` skill: read root [INSIGHTS.md](INSIGHTS.md), then the `INSIGHTS.md` of every module the task touches.
- Read when you need product purpose, architecture, roadmap or quick start: [README.md](README.md)

## Map

Each module has its own `CLAUDE.md`, plus `docs/`, `specs/` and `INSIGHTS.md`. Root `INSIGHTS.md` holds cross-module lessons only.

| Path | What |
|------|------|
| `server/` | `@devdigest/api` — Fastify API, Postgres, repo-intel indexer, review orchestration |
| `client/` | `@devdigest/web` — Next.js studio |
| `reviewer-core/` | `@devdigest/reviewer-core` — review engine |
| `e2e/` | `@devdigest/e2e` — deterministic browser e2e |
| `scripts/` | `dev.sh` (whole dev stack), `e2e.sh` (isolated e2e stack) |
| `docs/agent-prompts/` | canonical reviewer-agent system prompts |
| `.claude/skills/` | project skills (Fastify, Drizzle, Next, React, zod, …) |
| `.github/workflows/` | one path-filtered CI workflow per suite |

## Shared stack

Node ≥ 22 · TypeScript 5.9 (`strict`, ESM, `moduleResolution: Bundler`) · zod 3 · vitest 2 · Postgres 16 + pgvector (Docker, the only containerised service).

## Conventions

- Four independent packages, no workspace: install, run and test inside each package directory.
- Package manager follows the lockfile: **pnpm** in `server/` and `client/`, **npm** in `reviewer-core/` and `e2e/`.
- Cross-package code is shared as TypeScript **source** through tsconfig path aliases, never published packages. `@devdigest/shared` (Zod contracts + adapter interfaces) physically lives in `server/src/vendor/shared`.
- Git history starts at `92268dc9` (merge of PR #257, the starter backport); older commits are out of scope. Bound history queries to it: `git log 92268dc9..HEAD`, `git diff 92268dc9`.

## Gotchas

- `server/src/vendor/shared` is the contracts' source of truth. `reviewer-core` consumes it as source through a tsconfig alias; `client/src/vendor/shared` is a separate copy that has already drifted. A contract change affects all three packages: mirror it into the client copy.
- Migrations are never applied on boot: run `pnpm db:migrate` in `server/` after pulling a new migration.
- The API has no authentication and binds to loopback; keep it that way.
- CI path filters encode cross-package aliases (e.g. `reviewer-core/**` triggers `server-unit`). A new alias needs matching `paths:` in `.github/workflows/*.yml`.

## Pointers

- Read when adding or running tests, or touching CI: [TESTING.md](TESTING.md)
- Read when editing a reviewer agent's system prompt or the `Review` output contract: [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
- Read when choosing which project skill applies: [.claude/skills/README.md](.claude/skills/README.md)