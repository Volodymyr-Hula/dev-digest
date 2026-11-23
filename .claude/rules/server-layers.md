---
paths:
  - "server/src/modules/**"
  - "server/src/adapters/**"
  - "server/src/platform/container.ts"
---

# Server layering (onion)

Before adding or changing a route, service, repository, adapter, port or Container getter in `server/`, load the `onion-architecture` skill (`.claude/skills/onion-architecture/SKILL.md`). It has the layer map, recipes and self-check greps.

Hard rules (apply even without the skill):

- A route handler does `schema` → `getContext(container, req)` → one service call → return. Inside a handler, no `container.db`, `git`, `github()`, `llm()`, `secrets`, `codeIndex`, `embedder()`, `repoIntel` or `jobs`, and no import of `drizzle-orm`, `db/*`, `adapters/*` or a `repository.ts`.
- Only `repository.ts` touches Drizzle (`drizzle-orm`, `db/schema`). Services use repository methods and row types from `db/rows.ts`.
- Concrete adapters are built only in `platform/container.ts`: an override-first, lazy getter, plus a field in `ContainerOverrides` and a mock in `adapters/mocks.ts`. Services depend on port interfaces.
- New services take a narrow `deps` object, not the whole `Container`. Pass `github` / `llm` / `embedder` as lazy functions.
- Modules don't import each other's `service.ts` / `repository.ts` / `routes.ts`. Use Container getters.
- Don't extend the legacy violations in `.claude/skills/onion-architecture/references/known-deviations.md`. When you edit such a handler, move its adapter or DB call into the service first.
