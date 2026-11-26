# PR title and description

## Title

`<type>: <what changes for the user or the system>` — the main theme, ≤ 70 chars, same types as commits (`feat|fix|test|docs|refactor`). Example: `feat: per-severity finding counters and filter`.

## Body

Sections in this order; omit a section that would be empty.

```
## Summary
<1 paragraph: what the user sees or what changed and why.>
- <one bullet per visible change, place first: "PR list: …", "PR timeline: …">
  - <sub-bullets for behaviour details>

## Changes

### Contract
- <schema/field changes in server/src/vendor/shared; state whether mirrored into client/src/vendor/shared>

### Server
- <endpoints, queries, migrations by name>

### Client
- <components, hooks, lib modules by name>

### reviewer-core / e2e / tooling
- …

## ⚠️ After pulling
- Run `pnpm db:migrate` in `server/`. Migrations are not applied on boot.

## Notes
- <limitations, numbers that can disagree, out-of-scope items, known gaps>

## Test plan
- [x] <suite>: <passed>/<total> — only for runs done in this session
  - New: <test files>
  - Extended: <test files>
- [ ] <what was not verified, and why>

## Also in this branch
- <sha> <subject>
```

## Rules

- **Grounded.** Every claim maps to the diff, a commit or a command output from this session. Name the real identifiers (`PrMeta.severity_counts`, `GET /repos/:id/pulls`, `SeverityCounts.tsx`).
- **Summary is for a reader who won't open the diff**: behaviour first, implementation in Changes.
- **Changes** goes Contract → Server → Client → reviewer-core → e2e → tooling; only touched packages. A package with one change can be a single bullet without a subheading.
- **Test plan:** `[x]` only with numbers from an actual run (`205/205`, `tsc --noEmit clean`). Tests that exist in the diff but were not run here are `[ ]` with "not run in this session". Manual checks are `[x]` only if they were done in this session.
- **After pulling** whenever `## FLAGS` has `migration`, `env` or `deps`.
- **Also in this branch:** commits outside the main theme, newest first, `<short sha> <subject>`. Omit when every commit is on-theme.
- No marketing words, no emoji except the ⚠️ heading, no "this PR…" filler.

## Examples

### Feature across contract, server and client

```
## Summary

Findings now show a count per severity (CRITICAL / WARNING / SUGGESTION) in three places. On the PR page you can click a severity to see only its findings. Dismissed findings are never counted.

- PR list: new FINDINGS column with a count per severity from the latest review. Hovering it opens a popover with the 3 most severe findings, which are fetched on the first hover only.
- PR timeline: each finished run shows its severity counts and the same popover, in place of the plain "N finding(s)" text.
- Agent runs tab: a N CRITICAL · N WARNING · N SUGGESTION filter bar above "Review runs" that counts findings across all runs.
  - Picking a level hides runs without such findings and opens the rest, each showing only that level.
  - Clicking the active level again, or "Show all", clears the filter.

## Changes

Contract (server/src/vendor/shared → mirrored into client/src/vendor/shared)
- New SeverityCounts schema { critical, warning, suggestion }.
- PrMeta.severity_counts: nullable, set only by the list endpoint, null when the PR has never been reviewed.

## Server
- GET /repos/:id/pulls counts the findings of each PR's latest kind='review' review in one query that skips findings with dismissed_at set. Grouping reuses the existing rollupSeverities.

## Client
- New shared components/severity-counts/ (SeverityCounts + FindingsPopover). The popover renders into document.body so the table and run cards (overflow: hidden) can't clip it.
- New lib/findings.ts (countBySeverity, sortBySeverity, lineLabel, SEVERITY_ORDER). The old local copies now re-export from it.
- FindingsPanel / ReviewRunAccordion take a severityFilter prop. FindingsTab holds the filter state.
- RunHistory gets each run's findings through findingsByRun, matched by run_id. No server change was needed for the timeline.

## Notes

- Two counts can disagree: the severity counts change as soon as a finding is dismissed. The "· N blockers" suffix in the timeline is agent_runs.blockers, saved when the run finished, so after triage the two numbers can differ.
- The filter lives in component state only, not in the URL.

## Test plan

- [x] Server: new integration test in test/reviews.it.test.ts checks that severity_counts matches the latest review and drops by one after POST /findings/:id/dismiss. Full suite: 205/205.
- [x] Client: 73/73, tsc --noEmit clean.
  - New: SeverityCounts.test.tsx, FindingsTab.test.tsx.
  - Extended: PRRow, RunHistory, FindingsPanel.
- [x] Checked by hand on the dev stack: PR list column and popover, filter bar on PR #482 (click a level, then "Show all").
- [ ] Timeline counters in the browser: the local data has no runs that produced a review, so this is covered by unit tests only.

## Also in this branch

- d1704c4 docs: add per-module docs/specs and dedupe documentation
- 26f1133 feat: cost badge for review runs
- e906412 docs: split insights into root cross-module and per-module tiers
- cb4fe96 fix(dev): move default ports off 5432/3000/3001
- 42019db feat: implemented insights skill
- d961f31 docs: add root and per-module CLAUDE.md with docs/ and specs/ scaffolding
- 4c77824 refactor(e2e): move test flows from specs/ to flows/
```

### Feature with a migration

```
## Cost badge for review runs

Shows what each review run cost, in USD and tokens, with **zero extra model calls**. The cost the review engine already computed was being discarded; it is now saved and displayed.

### What you see
- **PR list:** a new **COST** column showing the cost of the latest review's run, e.g. `$0.012`.
- **PR Detail → verdict banner:** a badge `$0.014 · 8.2K→1.3K` (cost · input→output tokens).
- **Run trace drawer:** COST stat is back, using the same formatters.
- **No data → `—`, never `$0.00`.** This covers runs from before this change, unpriced models, and PRs that were never reviewed. A model with unknown price but known tokens shows `— · 8.2K→1.3K`.

### How it works
- `agent_runs.cost_usd` is restored (migration `0010`) and saved when a run completes. The value comes from the engine's `ReviewOutcome.costUsd`:
  - OpenRouter: the real `usage.cost` from the API response.
  - Other providers: the `PriceBook` / static pricing estimate.
  - Failed or cancelled runs: `null`.
- Cost is saved per run, so later price changes don't rewrite past runs.
- Contracts:
  - `cost_usd` is added to `RunSummary` and `RunStats`.
  - `PrMeta.cost_usd` is filled only by the list endpoint, by joining the latest review to its `agent_runs` row (the same run that gives SCORE).
  - Mirrored into `client/src/vendor/shared`.
- Client:
  - Shared formatters live in `src/lib/format.ts` (`formatUsd`, `formatTokenCount`, `formatTokenFlow`, `formatRunCost`).
  - The verdict banner gets its numbers by matching the review's `run_id` against the run list the page already loads, so there is no new request.

### ⚠️ After pulling
Run `pnpm db:migrate` in `server/`. Migrations are not applied on boot.

### Tests
- [x] server unit (175)
- [x] server integration (29). New in `reviews.it`:
  - The cost is saved and returned by the run list, the trace and the PR list.
  - A PR that was never reviewed gets `cost_usd: null`.
- [x] client unit (59), including new `format`, `VerdictBanner` and `PRRow` tests
- [x] e2e 7/7. `02-repo-pulls-detail` now checks the COST header.

### Notes / out of scope
- The banner line itself is covered by unit tests only. The seeded demo review has no linked run, so in e2e it can only ever show `—`.
- A run split per file reports `—` if any single model call returned no cost. It does not add up a partial total.
- Cached tokens are not tracked yet.
```

The examples differ in heading levels; new PRs use the section order and `##` headings from the Body template above.
