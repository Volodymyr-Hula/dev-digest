# Insights — client

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->
- **Don't size an auto-growing `<textarea rows={n}>` inside a `display:flex` row that has `maxHeight` — give it an explicit `height` and `alignItems:"flex-start"`** — the default `align-items: stretch` stretches the textarea to the clamped box height (520px), so with `overflowY:hidden` every line past ~25 was silently cut off while the line-number gutter kept counting. Evidence: `src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/_components/BodyEditor/styles.ts` `textareaHeight`; imported 504-line skill showed only 25 lines. (2026-11-24)
- **Don't pair `borderColor`/`borderWidth` with `borderLeft*` in an inline style that changes on rerender — use the four per-side longhands** — `borderColor`/`borderWidth` are shorthands too; React logs `Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)` once the value toggles (e.g. on focus). Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5-16`. (2026-11-20)

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->
- **Pass `retryLabel={t(…)}` whenever you give `ErrorState` an `onRetry`** — the design-system default is a hard-coded English "Retry" (`src/vendor/ui/primitives/ErrorState.tsx`), so a page that must take all its text from `messages/en/*.json` leaks an untranslated string otherwise. Pages written before the prop existed still use the default. (2026-11-24)

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **Read uploaded files with `FileReader` (`readFileBytes` in `ImportSkillModal/helpers.ts`), not `File#arrayBuffer()`** — jsdom's `File` has no `arrayBuffer`, so component tests fail with `TypeError: file.arrayBuffer is not a function`; `FileReader.readAsArrayBuffer` works in jsdom and browsers. Evidence: `ImportSkillModal.test.tsx` first run. (2026-11-24)
- **Import only types (`import type`) from `@devdigest/shared` in client code; mirror small runtime rules locally** — the vendored barrel re-exports with `.js` specifiers that Next's bundler cannot resolve, so a value import (e.g. a zod schema) passes `pnpm typecheck` and `pnpm test` but the page 500s in `next dev` with `Module not found: Can't resolve './contracts/findings.js'` (`src/vendor/shared/index.ts:17`). Only the e2e stack / browser catches it. Pattern: `isValidSkillName` in `src/lib/skill-meta.ts` mirrors `SkillName`, with a parity test against the contract (`skill-meta.test.ts`). Evidence: `scripts/e2e.sh` log, `GET /skills 500`. (2026-11-24)
- **Use `getAllByText`/`queryAllByText` for an agent name in tests that render an open `ReviewRunAccordion`** — the name shows in the accordion header and again in `VerdictBanner` (`agentName`), so `getByText` throws `Found multiple elements with the text`. Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:93` (header) + `VerdictBanner/VerdictBanner.tsx:46-50` (badge). (2026-11-20)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-24 — conventions page states, evidence links, multi-skill modal, trace skills row → `ErrorState` `retryLabel`.
- 2026-11-24 — long imported skill clipped in BodyEditor → flex-stretch textarea rule.
- 2026-11-24 — inline form validation, tag autocomplete, skill import modal, version activation → FileReader over `File#arrayBuffer` in tests.
- 2026-11-24 — Skills Lab UI (/skills, editor tabs, agent Skills tab) → type-only import rule for `@devdigest/shared`.
- 2026-11-20 — FindingCard border style rerender warning → per-side longhand rule.
- 2026-11-20 — split severity counter row from filter buttons, Dismiss→Reject label → `file:line` evidence on the duplicate agent-name entry.
- 2026-11-20 — severity counters + filter on PR page, timeline, PR list → duplicate agent-name test query.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
