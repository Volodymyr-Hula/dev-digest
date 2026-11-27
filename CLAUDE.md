# DevDigest

Local-first AI pull-request review starter: import a PR, run an agent review, get grounded findings.

- Before the first plan or edit of any task, run the `engineering-insights` skill: read root [INSIGHTS.md](INSIGHTS.md), then the `INSIGHTS.md` of every module the task touches.
- Before reporting a task that changed code as done, run the `engineering-insights` wrap-up.
- Before `git push` or opening a PR, run the `pr-self-review` skill (reviews all local changes vs `origin/main` — commits, staged, unstaged, untracked — against the client/server skills); a `critical` finding blocks push/PR via the guard hook in `.claude/settings.json`.
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
| `.claude/agents/` | project subagents: `researcher`, `planner`, `brainstorm`, `architecture-reviewer`, `security-reviewer`, `plan-verifier`, `implementer`, `test-writer`, `doc-writer` (catalog: `.claude/skills/README.md`) |
| `.github/workflows/` | one path-filtered CI workflow per suite |

## Shared stack

Node ≥ 22 · TypeScript 5.9 (`strict`, ESM, `moduleResolution: Bundler`) · zod 3 · vitest 2 · Postgres 16 + pgvector (Docker, the only containerised service).

## Commands

Four independent packages, no workspace: install, run and test inside each package directory. Package manager follows the lockfile: **pnpm 10** in `server/` and `client/`, **npm** in `reviewer-core/` and `e2e/`.

| Where | Run | Test | Typecheck |
|-------|-----|------|-----------|
| repo root | `./scripts/dev.sh` (Postgres + migrate + seed + API + web) | `./scripts/e2e.sh` (isolated browser e2e) | — |
| `server/` | `pnpm dev` · `pnpm db:migrate` · `pnpm db:seed` | `pnpm test`; unit only: `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `pnpm typecheck` |
| `client/` | `pnpm dev` | `pnpm test` | `pnpm typecheck` |
| `reviewer-core/` | — (library) | `npm test` | `npm run typecheck` |
| `e2e/` | — | via `./scripts/e2e.sh` | `npm run typecheck` |

No linter or formatter is configured; `typecheck` is the static gate before a commit.

## Naming

- Files and folders: kebab-case (`contained-read.ts`, `repo-intel/`, `client/src/components/severity-counts/`). Exceptions, all in `client/`:
  - React component files: `PascalCase.tsx`. Under `_components/` the folder is PascalCase too (`_components/FindingsPanel/FindingsPanel.tsx`); a cross-page component in `src/components/` sits in a kebab-case folder (`severity-counts/SeverityCounts.tsx`).
  - React hooks: camelCase `useX.ts` (`app-shell/hooks/useShellContext.ts`). TanStack Query hook modules in `src/lib/hooks/` are kebab-case per domain (`repo-intel.ts`).
  - Next.js route segments follow the router: `[repoId]`, `[number]`; `_`-prefixed folders/files are private (`_components/`, `server/src/db/schema/_shared.ts`).
- Server feature module: `server/src/modules/<kebab-name>/routes.ts`.
- Tests: `*.test.ts(x)`; DB-backed integration tests `*.it.test.ts`.
  - `client/`: colocated next to the source, `Name.test.tsx` / `name.test.ts`.
  - `server/test/`: `<area>[-<topic>].test.ts`, where `<area>` is a module, adapter or platform piece (`pulls-status.test.ts`, `repo-intel-resync.test.ts`, `contracts.test.ts`, `price-book.test.ts`).
  - `reviewer-core/test/`: named after the source file (`to-review.test.ts` ↔ `src/output/to-review.ts`).
- E2E flows: `e2e/flows/NN-<name>.flow.json`, `NN` the next free two-digit number.
- Migrations: `NNNN_<name>.sql`, name chosen by `drizzle-kit`.

## Protected files

Change these only through their tool, never by hand:

- **Migrations** (`server/src/db/migrations/*.sql`, `meta/`) — committed migrations are immutable history. A schema change goes in `server/src/db/schema/*.ts`, then `pnpm db:generate` adds a new migration.
- **Lockfiles** (`server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`) — they change only as a side effect of `pnpm add/remove` (pnpm 10) or `npm install <pkg>` in that package, committed together with its `package.json`.

## Conventions

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