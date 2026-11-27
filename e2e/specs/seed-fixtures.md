# Seed fixtures the flows depend on

Source of truth: `server/src/db/seed.ts`, applied by `pnpm db:migrate && pnpm db:seed` (`scripts/e2e.sh:125-128`, `.github/workflows/e2e-web.yml:66-71`). If a value here changes in the seed, the flows listed under "Used by" break.

## Preconditions

- S1. The DB is freshly seeded and the demo repo is the only repo. Flows reach the PR list through `/`, which redirects to `repos[0]` (`client/src/app/page.tsx:15-18`); with other repos present, `02`/`04`/`05` can land on the wrong repo. `01` only needs one repo, so it is order-independent (`flows/01-app-boot.flow.json:3`).
- S2. Seeding is idempotent per entity, but the PR, its files, commit, review and findings are inserted only inside `if (!pr)` (`seed.ts:99-176`). A DB that already has PR #482 is not repaired by re-seeding.
- S3. No API key or model is configured; none is needed (see [../docs/architecture.md](../docs/architecture.md)).

## Fixtures

| Fixture | Value | Ref | Used by |
|---------|-------|-----|---------|
| Workspace / user | `default` / `you@local` | `seed.ts:28-29` | all (implicit) |
| Repo | `acme/payments-api`, default branch `main`, `clonePath: null` | `seed.ts:83-88` | 01, 02, 04, 05 |
| PR number | `482` | `seed.ts:105` | 02, 04, 05 (`wait --url /pulls/482`) |
| PR title | `Add rate limiting to public API endpoints` | `seed.ts:106` | 02, 04, 05 (`find text … click`) |
| PR status | `needs_review`; PR list defaults to the `needs_review` filter | `seed.ts:114`; `client/src/app/repos/[repoId]/pulls/page.tsx:39-40` | 02, 04, 05 (row must be visible without changing the filter) |
| PR file path | `src/config.ts` (+4/-0); also `src/middleware/ratelimit.ts`, `src/api/public/webhooks.ts`, `src/api/users.ts` | `seed.ts` (`pr_files` block) | 05, 10 |
| PR files per Smart-diff role | `src/config.ts`, `src/api/users.ts` (core); `src/middleware/ratelimit.test.ts` (tests); `.env.example` (wiring); `docs/rate-limiting.md` (docs); `pnpm-lock.yaml` (boilerplate). All 5 groups are non-empty; `src/config.ts` is core because its basename has no `.config.` infix | `seed.ts` (`pr_files` block) | 10 |
| `src/config.ts` patch | one hunk `@@ -9,3 +9,7 @@` whose new line 12 is the seeded CRITICAL finding's line, so its inline card renders under that line | `seed.ts` (`configPatch`) | 10 |
| `src/api/users.ts` patch | one hunk at lines 10-20; it does NOT reach line 45, so the seeded WARNING finding is unanchored and renders in the end-of-file block | `seed.ts` (`usersPatch`) | 10 |
| Small patches of the extra role files | `ratelimit.test.ts`, `.env.example`, `docs/rate-limiting.md`, `pnpm-lock.yaml` each carry a 1-3 line hunk so their cards open without `No diff text available` | `seed.ts` (`pr_files` block) | 10 |
| Review | `kind: review`, `verdict: request_changes`, `score: 61`, `model: 'seed'`; no agent id or run id is set (Smart diff treats agentless reviews as one bucket, so its findings are the selected ones) | `seed.ts:136-147` | 04, 10 |
| Finding 1 | CRITICAL, `Hardcoded Stripe secret key in commit`, `src/config.ts:12` | `seed.ts:150-162` | 04, 10 (inline card, `blocker` label) |
| Finding 2 | WARNING, `N+1 query in user list endpoint`, `src/api/users.ts:45-52` | `seed.ts:163-174` | 04 (count only), 10 (unanchored block) |
| PR intent | `pr_intent` row for PR #482: `source: model`, class `feature`, confidence `medium`, summary `Add token-bucket rate limiting to the public API so unauthenticated clients cannot abuse it.`, sources include `ticket_key PAY-482` (`referenced_not_fetched`) | `seed.ts` (`PR #482 intent` block) | 09 (flow saves a user edit; later flows do not read it) |
| Agents | `General Reviewer`, `Security Reviewer`, `Performance Reviewer`, `API Contract Reviewer`, all enabled, openrouter / `deepseek/deepseek-v4-flash` | `seed.ts:180-214` | 03 (`Security Reviewer` only) |

Derived UI strings the flows assert:

| Flow text | Derived from | Ref |
|-----------|--------------|-----|
| `request changes` | `verdict.replace("_", " ")` in the run accordion badge | `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:94-96` |
| `2 findings` | `{n} finding{s}` over the two seeded findings | `ReviewRunAccordion.tsx:99-101` |
| newest run open by default | `defaultOpen={i === 0}` | `…/FindingsTab/FindingsTab.tsx:163` |
| `Agent runs` / `Files changed` | tab labels | `…/PrDetailHeader/PrDetailHeader.tsx:117-118` |
| `tab=findings` / `tab=diff` | tab key written to the URL via `?tab=` | `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:60,68`; `PrDetailHeader.tsx:117-118` |
| `Reviewer-ordered diff` | Files changed header, `smartDiff.reviewerOrdered` | `client/messages/en/prReview.json` |
| `Core` / `Tests` / `Wiring` / `Docs` / `Boilerplate` | Smart-diff group labels, rendered as written (no CSS uppercase) | `client/messages/en/prReview.json` (`smartDiff.*Label`) |
| `● 2` | Core group counter: number of FILES with findings (2 findings in 2 files) | `…/DiffTab/_components/SmartDiffGroup/SmartDiffGroup.tsx` |
| `blocker` | line label of a CRITICAL finding, `smartDiff.lineLabel.CRITICAL` | `client/messages/en/prReview.json` |
| `Pull Requests` | list page title `list.title` | `client/messages/en/prReview.json:66`, `pulls/page.tsx:76` |
| `COST` | list header, CSS-uppercased | `pulls/styles.ts:105` |

## Invariants

- S4. Seeded PR #482 has exactly 2 findings in one review; flow `04` hard-codes `2 findings`. Adding a finding or a second seeded review requires updating `04` and `10` (the Core counter `● 2`).
- S8. Smart-diff flow `10` relies on the Smart-diff group of each seeded file (`classifyFile`): renaming or moving a seeded path can change its role, so update `server/test/smart-diff.it.test.ts` and flow `10` together.
- S5. The seeded review has no `agent_runs` row, so it has no cost/token data; `02` asserts only the COST column header, not a value (`PRRow.tsx:62-63` renders `formatUsd(pr.cost_usd)` muted when null).
- S6. `pr_files` holds 8 rows while `files_count` is 9 (`seed.ts` `filesCount` vs the `pr_files` block); flows must not assert a file count.
- S7. Static UI strings with no seed dependency: `Add a repository`, `Repository URL` (`client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx:77,94`); settings section routes `api-keys`, `models` (`client/src/app/settings/[section]/_components/SettingsView/constants.ts:5-6`).
