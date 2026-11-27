---
name: client-layout
description: Decides where a file goes in client/ (@devdigest/web) and how it is named — App Router pages, colocated _components, shared src/components, lib/hooks query modules, lib utils, i18n messages, tests and fixtures, import style. Use whenever creating, moving, renaming or splitting a file under client/src or client/messages, or when unsure where new client code belongs — even if the request only says "add a component/hook/test/page".
user-invocable: false
---

# Client layout — what goes where in `client/`

Next.js is unopinionated about structure; this is **our** scheme. It decides placement only. Why it looks like this: [client/docs/ui-architecture.md](../../../client/docs/ui-architecture.md) (Component-folder convention, Server vs Client). How to write tests: `react-testing-library` skill and [TESTING.md](../../../TESTING.md).

All paths below are relative to `client/`. `<route>` is a folder under `src/app/` that holds a `page.tsx`.

## 1. I am adding X → put it here

| Adding | Path | Example in repo |
|---|---|---|
| Page (route) | `src/app/<segment>/page.tsx` — thin: params, data hooks, loading/error/empty switch, then render the view | `src/app/agents/page.tsx` |
| Component used by one page | `<route>/_components/<Name>/<Name>.tsx` | `src/app/repos/[repoId]/pulls/[number]/_components/RunStatus/` |
| Child of one component | `<Parent>/_components/<Child>/<Child>.tsx` | `AgentsListView/_components/CreateAgentModal/` |
| Component used by 2+ pages | `src/components/<kebab-name>/<Name>.tsx` (+ `index.ts`) | `src/components/severity-counts/SeverityCounts.tsx` |
| Hook that calls the API (TanStack Query) | `src/lib/hooks/<domain>.ts`, one domain per file; re-export from `src/lib/hooks/index.ts` | `src/lib/hooks/reviews.ts` |
| UI-only hook of one component | `<Name>/use<Thing>.ts` next to it; a shared component with several hooks gets `hooks/` + `index.ts` | `src/components/app-shell/hooks/useShellContext.ts` |
| Pure helper / constant of one component | that component's `helpers.ts` / `constants.ts` | `FindingCard/helpers.ts` |
| Helper / constant / style shared by one route's components | next to `page.tsx`: `<route>/helpers.ts`, `constants.ts`, `styles.ts` | `src/app/repos/[repoId]/pulls/helpers.ts` |
| Pure util used across routes | `src/lib/<kebab-purpose>.ts` — named by purpose, never `utils.ts` | `src/lib/format.ts`, `src/lib/github-urls.ts` |
| App-wide provider / context | `src/lib/<kebab>.tsx`, mounted in `src/lib/providers.tsx` | `src/lib/toast.tsx` |
| User-facing string | `messages/en/<namespace>.json` (new namespace = new file, no code change) | `messages/en/prReview.json` |
| Design-system primitive | `src/vendor/ui/` — read its README first | `src/vendor/ui/README.md` |
| API contract (zod schema / type) | `server/src/vendor/shared` (source of truth), then mirror into `src/vendor/shared` | root `CLAUDE.md` Gotchas |
| Nav item / settings section | `src/vendor/ui/nav.ts`, not `src/app/` | — |
| Component / unit test | next to the source: `<Name>.test.tsx`, `<name>.test.ts` | `FindingCard/FindingCard.test.tsx`, `src/lib/format.test.ts` |
| Shared test fixture / setup | `src/test/<kebab>.ts` | `src/test/findings.ts` |
| Browser flow (e2e) | not in `client/` — `e2e/flows/NN-<name>.flow.json` | — |

## 2. Promotion rule

- One consumer → the file lives next to it (deepest `_components/` that covers every consumer).
- A second **route** needs it → move it to `src/components/<kebab>/` (or `src/lib/`) in the same change and update both imports.
- A route never imports from another route's `_components/`. Two siblings under the same `_components/` may import each other through `../<Sibling>` (its `index.ts`).
- Don't promote speculatively; one consumer stays local.

## 3. Component folder anatomy

A component is a folder named like the component. Create only the files you need:

| File | Holds |
|---|---|
| `<Name>.tsx` | the component (+ `"use client"` when it uses hooks/state/handlers) |
| `index.ts` | the only import surface: `export { Name } from "./Name";` |
| `styles.ts` | `export const s = { … }` of `CSSProperties`, colours via CSS variables (`var(--bg-elevated)`) |
| `constants.ts` | magic values, i18n keys, grid templates |
| `helpers.ts` | pure functions only — no React, no hooks, unit-testable |
| `<Name>.test.tsx` | its test |
| `_components/` | its private children, each a folder of the same shape |

No CSS modules, no runtime CSS-in-JS. `className` only for the global helper classes (`mono`, `tnum`); everything else goes through `s`.

## 4. Imports

- Across zones (`app` ↔ `components` ↔ `lib` ↔ `test`) → `@/…` alias: `import { usePulls } from "@/lib/hooks";`.
- Inside one component folder → `./…` or `./_components/<Child>`; sibling component in the same `_components/` → `../<Sibling>`.
- Never climb out of a component folder with `../../…`; switch to `@/`.
- Import another component folder only via its `index.ts`, never `…/<Name>/<Name>`.
- UI only from `@devdigest/ui`; contracts only from `@devdigest/shared`.
- No new barrels above component level (no `src/components/index.ts`, no `_components/index.ts`). Never re-export server-only code (`src/i18n/request.ts`, anything using `node:*`) through a barrel a client file imports.
- `src/components/` and `src/lib/` never import from `src/app/`.

## 5. Naming

| Kind | Pattern | Example |
|---|---|---|
| Folder (generic) | kebab-case | `severity-counts/`, `lib/hooks/` |
| Component folder under `_components/` | PascalCase = component | `_components/RunStatus/` |
| Component file | `PascalCase.tsx` | `RunStatus.tsx` |
| Component support files | fixed lower-case names | `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts` |
| Hook file | `useCamelCase.ts`, exports the same name | `useGlobalShortcuts.ts` |
| Query hooks module | kebab-case domain | `lib/hooks/repo-intel.ts` |
| lib module / fixture | kebab-case purpose | `lib/model-label.ts`, `test/findings.ts` |
| Route segment | router syntax | `[repoId]`, `[section]`, `_components` |
| Message namespace | camelCase JSON | `messages/en/prReview.json` |

A hook is named `useX` only if it calls a hook; otherwise it is a helper (`getX`/`toX`). Change only the case of a file name with `git mv` (case-insensitive file systems hide the rename and break the Linux build).

## 6. Server vs Client

Pages are Client Components only when they call hooks/router themselves; otherwise keep `page.tsx` a Server Component and put `"use client"` in the colocated view (`src/app/agents/page.tsx` → `AgentsListView`). Full table and reasons: `client/docs/ui-architecture.md` → *Server vs Client Components*.

## 7. Known deviations

Existing files that break these rules are listed in [references/known-deviations.md](references/known-deviations.md). Don't copy them; don't fix them unless the task touches them or the user asks.

## 8. Checklist before finishing

- [ ] Every new file sits where table 1 says; nothing imports another route's `_components/`.
- [ ] Every new component folder has `index.ts`, and imports go through it.
- [ ] Imports follow section 4 (no `../../` out of a component folder).
- [ ] New user-facing strings are in `messages/en/*.json`.
- [ ] New logic has a colocated test; shared fixtures are in `src/test/`.
- [ ] `pnpm typecheck` and `pnpm test` pass in `client/`.
