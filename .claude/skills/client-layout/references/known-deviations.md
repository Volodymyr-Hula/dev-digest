# Known deviations from `client-layout`

Existing code that breaks the rules in [../SKILL.md](../SKILL.md). Don't copy these patterns into new code. Fix one only when the task already touches that file or the user asks; a bulk fix is a separate task.

| Where | Deviation | Target |
|---|---|---|
| `src/app/agents/[id]/page.tsx` | Imports `../_components/AgentCard` from the sibling `/agents` route | Move `AgentCard` to `src/components/agent-card/` |
| `src/app/**`, `src/components/**` | Many files climb out with deep relative paths (`../../../../../../../lib/hooks/agents` in `AgentEditor/_components/ConfigTab/ConfigTab.tsx`) | `@/lib/...` |
| `src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/atoms.tsx` | Several small components in one lower-case file, no folder | One folder per component under `_components/` |
| `src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/` | No `index.ts`; consumers import `../RunHistory/RunHistory` | Add `index.ts`, import via it |
| `src/components/severity-counts/FindingsPopover.tsx` | Second component as a loose file beside the main one | `severity-counts/_components/FindingsPopover/` |
| `src/components/diff-viewer/` | Child components are PascalCase folders directly in the kebab folder, without `_components/` | `diff-viewer/_components/<Child>/` |
| `src/app/onboarding/_components/AddRepoView/`, `src/app/agents/_components/AgentCard/` (delete button), `.../_components/ReviewRunAccordion/` | Inline style objects / inline constants instead of `styles.ts` / `constants.ts` | Extract when editing |
| `src/app/**/page.tsx` for `/`, `/onboarding`, PR detail, and `OverviewTab`, `DiffTab`, `FindingsTab`, `ReviewRunAccordion` | Literal English strings | `messages/en/<namespace>.json` |
