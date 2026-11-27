# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [onion-architecture](onion-architecture/SKILL.md) | Backend | `server/` layering: route → service → repository, adapters only via the Container, dependencies inward |
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [client-layout](client-layout/SKILL.md) | Frontend | Where files go in `client/`: pages, `_components`, shared components, hooks, utils, messages, tests, import style (paired with `.claude/rules/client-layout.md`) |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [pr-self-review](pr-self-review/SKILL.md) | Shared | Before push/PR: reviews all local changes (commits not in the base, default `origin/main`, + working tree) with `general-purpose` reviewers routed by diff to the client/server skills; a critical finding blocks `git push` / `gh pr create|merge` via the `guard-pr.sh` hook |
| [create-pr](create-pr/SKILL.md) | Shared | Opens/updates a PR into a destination branch (default `main`): commits leftovers, fixes unpushed commit types, merges the destination on predicted conflicts, flags oversized/mixed PRs, writes the description; push is gated by the `pr-self-review` hook |
| [engineering-insights](engineering-insights/SKILL.md) | Shared | Root (cross-module) + per-module INSIGHTS.md: read before work, record non-obvious findings after |

## Agents

Project subagents live in `.claude/agents/`.

| Agent | Model | Description |
|-------|-------|-------------|
| [researcher](../agents/researcher.md) | sonnet | Read-only research of the codebase and the web; every finding cites `file:line` or a fetched URL + section |
| [planner](../agents/planner.md) | opus | Writes a grounded spec + ordered plan for one task to `<module>/specs/<slug>.md` (root `specs/` when 2+ modules); writes are limited by `.claude/hooks/agent-spec-write.sh` |
| [brainstorm](../agents/brainstorm.md) | opus | Read-only option comparison before implementation: distinct options incl. baseline, must-have gates, reasoned scores, verdict + premortem |
| [architecture-reviewer](../agents/architecture-reviewer.md) | opus | Read-only review of local changes for layer boundaries, coupling, leaking abstractions; backed by the onion greps and `server/`/`client/` `.dependency-cruiser.cjs`; CLEAN/ISSUES |
| [security-reviewer](../agents/security-reviewer.md) | opus | Read-only, no-network audit of local changes for exploitable issues (source→sink, deployment-adjusted severity, confidence ≥0.8); preloads `security`; PASS/BLOCK |
| [plan-verifier](../agents/plan-verifier.md) | opus | Read-only check of finished changes against a given spec/plan: traceability table, scope creep, deviations, missing tests; runs no tests; PASS/PASS-WITH-GAPS/FAIL |
| [implementer](../agents/implementer.md) | sonnet | Implements one task (text or a plan) in source only — no tests, docs, specs, migrations, manifests or lockfiles; runs the touched packages' typecheck + unit tests; reports changes, checks, follow-ups |
| [test-writer](../agents/test-writer.md) | sonnet | Writes tests only (colocated client tests, `server/test/`, `reviewer-core/test/`, e2e flows + their coverage/seed-fixture rows), runs them (incl. `./scripts/e2e.sh`); a test exposing a real bug stays red and is reported |
| [doc-writer](../agents/doc-writer.md) | sonnet | Updates Markdown under the five `docs/` folders (never `docs/agent-prompts/`), every statement grounded in code read in the run; reports stale text outside its scope |

Bash is limited by `.claude/hooks/agent-readonly-bash.sh`: read-only commands for the reviewer/verifier agents and `doc-writer`; the `checks` extra adds the exact typecheck/test forms (`pnpm -C <server|client> …`, `npm --prefix <reviewer-core|e2e> …`, never `add`/`install`) for `implementer` and `test-writer`, and `e2e` adds `./scripts/e2e.sh` for `test-writer`. Writes of the three writer agents are path-scoped by `.claude/hooks/agent-write-scope.sh <profile>`. The agent's `permissionMode` is not relied on: it inherits the session's auto mode. Tests: `bash .claude/hooks/test/*.test.sh`. Every agent is independent — none calls another (`Agent` and `Skill` are disallowed; skills come only via `skills:` preload) or needs another's output as input.

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.claude/rules/*.md`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
