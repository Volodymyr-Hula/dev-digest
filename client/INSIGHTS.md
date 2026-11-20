# Insights — client

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **Use `getAllByText`/`queryAllByText` for an agent name in tests that render an open `ReviewRunAccordion`** — the name shows in the accordion header and again in `VerdictBanner` (`agentName`), so `getByText` throws `Found multiple elements with the text`. Evidence: `src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:93` (header) + `VerdictBanner/VerdictBanner.tsx:46-50` (badge). (2026-11-20)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-20 — split severity counter row from filter buttons, Dismiss→Reject label → `file:line` evidence on the duplicate agent-name entry.
- 2026-11-20 — severity counters + filter on PR page, timeline, PR list → duplicate agent-name test query.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
