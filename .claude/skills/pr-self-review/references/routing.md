# Routing: changed file → review skills

Match every path from `## FILES` against the globs; a file collects the skills of **every** row it matches. Skill paths are relative to `.claude/skills/`.

## client

| Glob | Skills |
|---|---|
| `client/src/**/*.{ts,tsx}`, `client/messages/**` | `client-layout/SKILL.md`, `react-best-practices/SKILL.md` |
| `client/src/app/**` | + `next-best-practices/SKILL.md` (open its topic files only when the diff touches that topic: `rsc-boundaries.md`, `data-patterns.md`, `route-handlers.md`, …) |
| `client/**/*.test.{ts,tsx}` | + `react-testing-library/SKILL.md` |
| `client/src/vendor/shared/**` | + `zod/SKILL.md` |

Also applies: `.claude/rules/client-layout.md` (hard rules), `client/CLAUDE.md`.

## server

| Glob | Skills |
|---|---|
| `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/container.ts` | `onion-architecture/SKILL.md` (+ `references/known-deviations.md`) |
| `server/src/modules/**/routes.ts`, `server/src/app.ts`, `server/src/platform/**` | + `fastify-best-practices/SKILL.md`, `security/SKILL.md` |
| `server/src/db/schema/**`, `**/repository.ts` | + `drizzle-orm-patterns/SKILL.md`, `postgresql-table-design/SKILL.md` |
| `server/src/vendor/shared/**` | + `zod/SKILL.md` |

Also applies: `.claude/rules/server-layers.md` (hard rules), `server/CLAUDE.md`.

## No skill review

- `reviewer-core/**`, `e2e/**`, `scripts/**`, `.github/**`, root config files — deterministic checks + typecheck only. List them in the report under "not covered by a skill".
- Already excluded from the change set by `review-state.sh`: `**/*.md`, `reports/`, `research_notes/`, `.claude/`.

## Typecheck per touched package

| Package | Command (run inside the package dir) |
|---|---|
| `server` | `pnpm typecheck` |
| `client` | `pnpm typecheck` |
| `reviewer-core` | `npm run typecheck` |
| `e2e` | `npm run typecheck` |

A change in `server/src/vendor/shared/**` also typechecks `reviewer-core` (it consumes the contracts as source).
