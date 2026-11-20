# Insights — e2e

Maintained via the `engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`); entry format and rules live there.

## What Works
<!-- approaches and solutions that proved effective here -->

## What Doesn't Work
<!-- dead ends and antipatterns, each with why it failed; the most valuable section -->

## Codebase Patterns
<!-- unwritten conventions and architectural decisions, with the reason -->

## Tool & Library Notes
<!-- dependency quirks, version-specific behaviour, CLI gotchas -->
- Matching `wait --text` against CSS-uppercased text → promoted to [specs/flow-format.md](specs/flow-format.md) F8. Evidence: `specs/flow-format.md:42`. (2026-11-20)

## Recurring Errors & Fixes
<!-- exact error text → cause → fix -->
- **`mise ERROR agent-browser is not provided by the active node@…` → every flow fails at `agent-browser open`** — the global CLI was installed under another node version than the one providing pnpm, and `mise exec node@<old>` breaks pnpm instead. Fix: point the runner at the binary directly — `AGENT_BROWSER_BIN=$(mise where node@<version-with-agent-browser>)/bin/agent-browser ./scripts/e2e.sh` (the env reaches `run.ts` through `npm test`) — or symlink it into a dir prepended to `PATH`, or reinstall agent-browser for the active node. Evidence: `run.ts:40` (`BIN = process.env.AGENT_BROWSER_BIN ?? "agent-browser"`), `../scripts/e2e.sh:163`; `agent-browser open about:blank`; `0/7 flows passed`. (2026-11-20)

## Session Notes
<!-- one dated line per session that produced an entry above -->
- 2026-11-20 — self-check fixes → `file:line` evidence on all entries; agent-browser fix extended with `AGENT_BROWSER_BIN`.
- 2026-11-20 — dedupe → promoted the CSS-uppercase entry to `specs/flow-format.md` F8.
- 2026-11-20 — cost badge e2e step → CSS-uppercase text match, agent-browser node-version workaround, 05 flake question.

## Open Questions
<!-- unverified hypotheses and unresolved items; move out once answered -->
- **`05-pr-diff` flakes on `find text … click` right after `wait --url /pulls`** — failed once and passed 3 times on an unchanged flow. It probably needs a `wait --text <title>` before the click, as `02` does. Unverified. Evidence: `flows/05-pr-diff.flow.json:6-7` (no wait between) vs `flows/02-repo-pulls-detail.flow.json:6-9`. (2026-11-20)
