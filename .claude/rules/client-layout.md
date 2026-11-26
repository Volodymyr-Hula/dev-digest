---
paths:
  - "client/src/**"
  - "client/messages/**"
---

# Client file placement

Before creating, moving, renaming or splitting a file under `client/`, load the `client-layout` skill (`.claude/skills/client-layout/SKILL.md`) — it has the full "what goes where" table.

Hard rules (apply even without the skill):

- Component of one page → `<route>/_components/<Name>/`; needed by a second route → move to `src/components/<kebab>/`. A route never imports another route's `_components/`.
- A component is a folder with `index.ts`; import it only through that `index.ts`.
- Imports across `app` / `components` / `lib` / `test` use `@/…`; `./…` only inside one component folder; never `../../` out of it.
- API data only through `src/lib/hooks/<domain>.ts`; user-facing strings only in `messages/en/*.json`.
- Tests sit next to the source (`<Name>.test.tsx`); shared fixtures in `src/test/`.
