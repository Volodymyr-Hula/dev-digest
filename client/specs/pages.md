# Pages spec

Concrete behaviour of every route under `client/src/app/**/page.tsx`. Each statement is checkable against the cited `path:line` (paths relative to `client/src/`; `pulls/` = `app/repos/[repoId]/pulls/`). Architecture and rationale: [../docs/ui-architecture.md](../docs/ui-architecture.md). This file is the only route map.

Hook → endpoint map (`lib/hooks/*`, all via `api.*` → `apiFetch`):

| Hook | Request |
|------|---------|
| `useRepos` core:67 | `GET /repos` |
| `useAddRepo` core:74 | `POST /repos {url}` |
| `useRefreshRepo` core:82 | `POST /repos/:id/refresh` |
| `useDeleteRepo` core:93 | `DELETE /repos/:id` |
| `usePulls` core:102 | `GET /repos/:id/pulls` |
| `usePullDetail` core:114 | `GET /pulls/:prId` |
| `useSettings` / `useUpdateSettings` core:23,30 | `GET` / `PUT /settings` |
| `useSecretsStatus` core:58 | `GET /settings/secrets-status` |
| `useTestConnection` core:38 | `POST /settings/test-connection {provider, key?}` |
| `useAgents`, `useAgent`, `useCreateAgent`, `useUpdateAgent`, `useDeleteAgent` agents:8-72 | `GET /agents`, `GET /agents/:id`, `POST /agents`, `PUT /agents/:id`, `DELETE /agents/:id` |
| `useProviderModels` agents:84 | `GET /providers/:provider/models` |
| `useSkills`, `useSkill`, `useCreateSkill`, `useUpdateSkill`, `useDeleteSkill` (skills) | `GET /skills`, `GET /skills/:id`, `POST /skills`, `PUT /skills/:id`, `DELETE /skills/:id` |
| `useSkillTags`, `useSkillVersions` (skills) | `GET /skills/tags`, `GET /skills/:id/versions` |
| `useActivateSkillVersion` (skills) | `POST /skills/:id/versions/:version/activate` |
| `useImportSkillPreview` (skills) | `POST /skills/import/preview {kind:'url',url} \| {kind:'file',filename,content_base64}` |
| `useAgentSkills` / `useSetAgentSkills` (skills) | `GET /agents/:id/skills` / `POST /agents/:id/skills {skill_ids}` |
| `usePrReviews` reviews:51 | `GET /pulls/:prId/reviews` |
| `usePrRuns` / `usePrActiveRuns` reviews:40,28 | `GET /pulls/:prId/runs` / `…/runs/active` |
| `useRunReview` reviews:124 | `POST /pulls/:prId/review {agentId}` or `{all:true}` |
| `useFindingAction` reviews:139 | `POST /findings/:id/accept` or `/dismiss` |
| `useCancelRun` / `useDeleteRun` / `useDeleteReview` reviews:74,60,81 | `POST /runs/:id/cancel` / `DELETE /runs/:id` / `DELETE /reviews/:id` |
| `usePrComments` / `useCreatePrComment` reviews:91,108 | `GET` / `POST /pulls/:prId/comments` |
| `useRunTrace` trace:12 | `GET /runs/:id/trace` |
| `useRunEvents` reviews:168 | SSE `GET /runs/:id/events` |

## Route table

| Route | File | Params / search | Kind |
|-------|------|-----------------|------|
| `/` | `app/page.tsx` | – | client |
| `/onboarding` | `app/onboarding/page.tsx` → `AddRepoView` | – | client |
| `/repos/:repoId/pulls` | `pulls/page.tsx` | `repoId`; `?status` | client |
| `/repos/:repoId/pulls/:number` | `pulls/[number]/page.tsx` | `repoId`, `number`; `?tab`, `?trace` | client |
| `/repos/:repoId/conventions` | `app/repos/[repoId]/conventions/page.tsx` → `ConventionsView` | `repoId` | client |
| `/agents` | `app/agents/page.tsx` → `AgentsListView` | – | server page, client view |
| `/agents/:id` | `app/agents/[id]/page.tsx` | `id`; `?tab` | client |
| `/skills` | `app/skills/page.tsx` → `SkillsListView` | – | server page, client view |
| `/skills/:id` | `app/skills/[id]/page.tsx` | `id`; `?tab` | client |
| `/settings/:section` | `app/settings/[section]/page.tsx` → `SettingsView` | `section` | server page, client view |

No other `page.tsx` exists (no `/showcase`, no `/settings` index; `/settings` alone is a 404, nav links always target `/settings/api-keys`, `vendor/ui/nav.ts:35`).

## `/` — home / redirect

- Calls only `useRepos()` (`app/page.tsx:13`). Renders inside `AppShell` + `PageContainer` (21-23).
- When the repo list is non-empty it `router.replace`s to `/repos/<repos[0].id>/pulls` (15-19) — the **first** repo, not the stored `dd-repo`.
- Loading: 3 `Skeleton`s (24-29). Error **or** empty list: the same `EmptyState` "No repositories yet" with CTA → `/onboarding` (30-37); a failed fetch is indistinguishable from "no repos". Non-empty: "Taking you to your repository…" + button to the first repo (38-44) shown until the redirect lands.
- Strings are literal English (no `useTranslations`).

## `/onboarding` — add repository

`onboarding/page.tsx:5-9` renders `AddRepoView` (`onboarding/_components/AddRepoView/AddRepoView.tsx`). Not wrapped in `AppShell`.

- Single field: repository URL. Submit is a no-op on blank input (30-31); button disabled when blank or pending (134); label switches to "Cloning…" while pending (136). Enter in the field submits (100-101).
- `POST /repos {url: trimmed}` (via `useAddRepo`); on success `router.push('/repos/<new id>/pulls')` (32-33) and `["repos"]` is invalidated (core:78).
- On failure the message is shown **inline** (`ApiError.message`, else "Could not add repository", line 37; banner 106-122), plus the global mutation toast ([api-client](api-client.md#how-errors-surface-contract-for-callers)).
- Escape or the close icon / Cancel → `router.push('/')` (19-28). Link "Settings → API Keys" → `/settings/api-keys` (82-85); API keys are not entered here.

## `/repos/:repoId/pulls` — PR list

`pulls/page.tsx`. Hooks: `usePulls(repoId)` (polls every 60 s and refetches on window focus, core:107-110), `useRefreshRepo`, `useActiveRepo`, `useRepoNotFound` (:33-36).

State location:

| State | Where | Default |
|-------|-------|---------|
| status filter | URL `?status=` (39-44, written with `router.replace`, always explicit) | `needs_review` |
| text query, sort | local `useState` (46-47), **not** in the URL | `""`, `newest` |

Behaviour:

- Filter chips: `all`, `needs_review`, `reviewed`, `stale` (`pulls/constants.ts:34`). The predicate is `status === "all" || p.status === status` (51), so a hand-typed `?status=merged` filters to merged PRs while no chip is active.
- Text search matches lowercased title or the PR number as a substring (52). Sort is by `Date.parse(updated_at)`, missing → 0; `oldest` ascending, otherwise descending (54-58).
- Subtitle counts: "open" = status ∈ {`needs_review`,`reviewed`,`stale`}, "needs review" = `needs_review` (25, 60-61); while `pulls` is undefined the subtitle is the loading string (78-80).
- Table has 8 columns (`COLUMN_KEYS` in `pulls/constants.ts`). Findings cell: `SeverityCounts` from `pr.severity_counts` (non-dismissed findings of the latest `kind=review` review, server-side), `—` when null or all zero; hovering opens `FindingsPopover` and only then enables `usePrReviews(pr.id)` (lazy, newest `kind=review` entry's findings). Row click → `/repos/:repoId/pulls/:number` (`PRRow.tsx:25`). Score cell shows `—` when `pr.score == null` (PRRow:20,51-56); cost (server-side sum over all successful runs) via `formatUsd` (`lib/format.ts:10`), `—`-style placeholder when `cost_usd` is null (PRRow:62-64).
- Refresh button → `POST /repos/:id/refresh`, disabled while pending (96-97); success invalidates `["repos"]` and `["pulls", repoId]` (core:87-88).
- `AutoTriggerStatus` is rendered with a hard-coded `on={false}` (84).

States (evaluated in this order):

1. `repoNotFound` (repos loaded, none matches `:repoId`) → `AppShell` + `RepoNotFound` empty state, CTA → `/onboarding` (64-70; `lib/repo-context.tsx:70-71`; false while repos load or if the repos fetch failed).
2. `isLoading` → 4 skeleton rows (107-112, `SKELETON_ROWS`).
3. `isError` → `ErrorState`, body = `ApiError.message` or `list.errorBody`, retry → `refetch()` (113-118).
4. `filtered.length === 0` → `EmptyState`; body differs for `all` vs a specific status (119-128).
5. Otherwise one `PRRow` per PR, keyed by `number` (130).

## `/repos/:repoId/pulls/:number` — PR detail

`pulls/[number]/page.tsx`. Every PR API is keyed by the row **uuid**, so the page resolves `number → id` from the cached `usePulls(repoId)` list (33-36). Hooks: `usePullDetail(prId)` (disabled while `prId` is null, core:118), `usePrReviews`, `usePrActiveRuns`, `usePrRuns`, `useDeleteRun`, `useCancelRun` (35-50); children add `useAgents`, `useRunReview`, `useFindingAction`, `useDeleteReview`, `usePrComments`, `useCreatePrComment`, `useRunTrace`, `useRunEvents`.

State in URL: `?tab=` (default `overview`, **not validated**, 60) and `?trace=<runId>` (61). Both are changed with `router.replace`, other params preserved (62-67). An unknown `?tab` renders the header and no body, because each tab body is gated by `tab === "<name>"` (137,139,164). Valid tabs (`PrDetailHeader.tsx:111-120`): `overview`, `findings` (label "Agent runs", count badge = total findings), `diff` ("Files changed", count = `pr.files_count`).

Page states, in order:

1. `repoNotFound` → `RepoNotFound` (90-96).
2. `isLoading = pullsLoading || (prId != null && detailLoading)` → 3 skeletons (39, 98-108).
3. `isError || !pr` → full-screen `ErrorState` "Couldn't load this pull request"; body = `ApiError.message` or ``PR #n could not be loaded.`` (110-121). A `:number` that is not in the PR list ends here (`prId` null → `pr` undefined).
4. Otherwise `PrDetailHeader` + the active tab body (123-172).

Header (`PrDetailHeader.tsx`): number, title, author, `branch → base`, `+additions −deletions`, status badge; "View on GitHub" (disabled until `repoFullName` known, opens `noopener,noreferrer`); `RunReviewDropdown` only when `prId` is set (93). `merged`/`closed` PRs show a warning banner (102) and a dimmed dropdown trigger but can still be reviewed (`RunReviewDropdown.tsx:63-72`).

Run review: `RunReviewDropdown` offers "Run all" (`{all:true}`, only enabled agents) and one item per agent regardless of `enabled` (`RunReviewDropdown.tsx:54-61`). Starting a run switches to the `findings` tab (page:132) and invalidates `["pr-active-runs", prId]` (133); `useRunReview` itself invalidates `["reviews", prId]` (reviews:133).

Tab `overview` (`OverviewTab`): renders the PR body as plain text in a `Description` section only when body is non-empty; otherwise nothing.

Tab `findings` (`FindingsTab.tsx`):

- Live block when `liveRunIds.length > 0`: Cancel (one `POST /runs/:id/cancel` per live run, 44-46), "Open run trace" (first live run, sets `?trace=`), and `RunStatus` (SSE log) (76-101). "Review in progress…" banner while `reviewRunning` (103-111).
- `lethal_trifecta` findings (kind) add a banner with count (113-121).
- Timeline (`RunHistory`) shown when there are runs or commits; clicking an agent opens and scrolls to that run's accordion. A settled run whose review (matched by `run_id`, `findingsByRun`) has live findings shows `SeverityCounts` + hover popover; otherwise the `N finding(s)` text. The blockers suffix still reads the run-time snapshot `run.blockers`. A settled run also shows its cost and token flow (`formatRunCost`, e.g. `$0.012 · 8.2K→1.2K`) under its time; failed/cancelled/running runs show none.
- Severity counters + filter, inside each open review accordion under `VerdictBanner` (`FindingsPanel`): (1) a counter row `N CRITICAL · N WARNING · N SUGGESTION` (`data-testid="severity-counts"`) listing **only** levels with a non-zero count; (2) below it, three filter buttons `Critical` / `Warning` / `Suggestion`, always rendered, zero-count ones disabled. Counts tally exactly the cards that panel can show — that review's findings after "Hide low confidence", dismissed (shown as "rejected") included (`countBySeverity(…, { includeDismissed: true })` over `confidentFindings`). Local per-panel state, not in the URL. A filter button shows only that level's cards (count = counter number); clicking it again or "Show all" resets.
- "Review runs": one `ReviewRunAccordion` per review (newest first), the first `defaultOpen` (156-170). Empty state "No findings yet" only when there are no reviews **and** nothing is running (147-154).
- Inside an open accordion: `VerdictBanner` + `FindingsPanel` (`ReviewRunAccordion.tsx`, `{open && …}`). `FindingsPanel` has a "hide low confidence" toggle (threshold 0.65, `FindingsPanel/constants.ts:6`) and window-level keys `j`/`k` (move focus), `a`/`d` (accept/reject focused finding — the card's "Reject" button is the `dismiss` action, ignored while typing in `INPUT`/`TEXTAREA`) (`FindingsPanel.tsx:34-46`); actions call `POST /findings/:id/(accept|dismiss)` and invalidate `["reviews", prId]` (reviews:157-159).
- Delete of a run (timeline) and of a review (accordion header) are guarded by `window.confirm` (page:152-155; `ReviewRunAccordion.tsx` delete button).
- When live streams all close, `onRunDone` invalidates active-runs + run-history and refetches reviews (page:156-160).

Tab `diff` (`DiffTab`): file-by-file `DiffViewer` from `pr.files`; comments are hidden until toggled, the toggle only appears when `comments.length > 0`; posting a comment reveals them again (`DiffTab.tsx:22,28-40`). Inline commenting is offered only when `pr.status === "open"` and `prId` is set (page:169; DiffTab:28). Failure → `notify.error` and the error is re-thrown to the composer (DiffTab:36-39).

Trace drawer: rendered when `prId && ?trace` (page:174-182); its Configuration section lists `skills_used` as `name vN` links to `/skills/:id` (the skill texts sit in the "Skills (dynamic)" prompt block); `findings`/`agentName` come from the matching review by `run_id`; close removes `?trace`. It shows the persisted trace, not a live stream ([why](../docs/ui-architecture.md#live-run-updates-sse--polling)).

## `/agents` — agent list

`app/agents/page.tsx:5-7` → `AgentsListView` (`agents/_components/AgentsListView/AgentsListView.tsx`). Hooks: `useAgents`, `useUpdateAgent` (20-21).

- Search filters client-side on `name + description`, case-insensitive substring (`helpers.ts:4-8`).
- "Add agent" dropdown: "Create from scratch" and every template entry (`TEMPLATES`) all just open the same `CreateAgentModal` (53-62); templates carry no preset.
- `CreateAgentModal`: `POST /agents {name, description, provider, model, system_prompt}`; blank name → default name; on success closes and `router.push('/agents/<id>?tab=config')` (`CreateAgentModal.tsx:23-33`).
- Card click → `/agents/:id?tab=config` (89). Toggle → `PUT /agents/:id {enabled}` (90). Delete (trash icon on the card) → `window.confirm` then `DELETE /agents/:id` (`AgentCard.tsx:44`).
- States: loading = 3 skeletons (66-72); error = `ErrorState` with retry (73); empty = `EmptyState` with create CTA whenever the **filtered** list is empty and not loading/erroring (74-82) — a search with no hits shows the same "no agents" copy; otherwise a card grid (83-94).

## `/agents/:id` — agent editor

`app/agents/[id]/page.tsx`. Hooks: `useAgents` (left list), `useAgent(id)`, `useUpdateAgent` (23-25).

- `?tab` is validated against `VALID_TABS = ["config", "skills"]`, fallback `config`. `setTab` writes `?tab=` with `router.replace`. `AgentEditor` renders `SkillsTab` for `skills`, otherwise `ConfigTab`.
- Error state evaluated first: `isError || (!isLoading && !agent)` → full-screen `ErrorState` "Couldn’t load this agent", retry → `refetch` (40-51). Otherwise a two-pane layout (53+): left = all agents as `AgentCard`s (click → `/agents/:id?tab=<tab>`, toggle → `PUT {enabled}`, 83-91); right = skeleton while loading (96-100) else header (name, `provider/model` badge, `disabled` badge, "Run on a PR…" → `/`, 103-115) + `AgentEditor`.
- The left "Add → Create from scratch" navigates to `/agents` (78); it does not open the create modal.
- `ConfigTab` (`AgentEditor/_components/ConfigTab/ConfigTab.tsx`): local form state, reset only when `agent.id` changes (29-39). Save → `PUT /agents/:id` with `name, description, provider, model, system_prompt, strategy, ci_fail_on, repo_intel, enabled` (55-70); success toast with `version` (74) and an inline "Saved (vN)" note (140-142); the cache gets the response via `setQueryData(["agent", id])` + `["agents"]` invalidation (agents:66-67). Model list = `GET /providers/<provider>/models`; the current model is always injected into the options, and an empty loaded list switches the hint to the "key missing" text (41-49, 100-103). `output_schema` is a read-only single-option select (133-135).
- Breadcrumb root "Skills Lab" is a literal (35).
- `SkillsTab` (`AgentEditor/_components/SkillsTab/SkillsTab.tsx`): every workspace skill as a checkbox row, sorted by name (= prompt order), filter on name/description/tags, header `{linked} of {total} enabled`. Toggling sends the whole linked id set → `POST /agents/:id/skills {skill_ids}`. Globally disabled skills stay listed (dimmed, "disabled globally"). No reordering — the server orders by skill name.
- `AgentCard` always shows `ag.skill_count` (from `GET /agents`).

## Forms — inline validation

Every form validates through `useFormValidation(values, rules, idPrefix)` (`src/lib/useFormValidation.ts`) with rules from `src/lib/validation.ts` (`required`, `maxLen`, `skillName`, `httpsUrl`, `githubRepoUrl`; messages in `messages/en/validation.json`). A field's error appears after its first blur and then follows every change; submit buttons stay enabled, and submitting touches all fields and focuses the first invalid one. `FormField error/htmlFor` renders the message (`role="alert"`), `TextInput`/`Textarea`/`SelectInput` `invalid` draws the red border + `aria-invalid`. Server conflicts go through `setServerError(field, msg)` and clear when the value changes. Used by: `CreateSkillModal`, `ImportSkillModal`, skill `ConfigTab`, `CreateAgentModal` (name, model, system prompt), agent `ConfigTab` (name, system prompt), `AddRepoView` (GitHub URL). `SettingsApiKeys` has no client rule (an empty key tests the stored one).

## `/skills` — skill list

`app/skills/page.tsx` → `SkillsListView` (`skills/_components/SkillsListView/SkillsListView.tsx`). Hooks: `useSkills`, `useUpdateSkill`.

- Search filters client-side on `name + description + tags` (`helpers.ts`).
- "Add Skill" is a menu: Create from scratch / Import from file / Import from URL. Community import is not built.
- `CreateSkillModal` (fields in the shared `components/skill-draft-fields`: name, description, type, tags with suggestions, body): `POST /skills {name, description, type, tags, body}`. Inline validation (`SKILL_DRAFT_RULES`: name required + kebab-case, description ≤ 500, body required); Create stays enabled and validates on click; a 409 shows "already exists" on the name field. On success → `/skills/<id>?tab=config`.
- `ImportSkillModal` (`mode: file | url`): step 1 picks a `.md/.markdown/.zip/.skill` file (≤ 2 MB, read as base64) or an https URL → `POST /skills/import/preview`; nothing is saved. Step 2 shows the untrusted note, server warnings, the editable draft (`SkillDraftFields` without body), the ignored archive files and the body rendered as markdown; `name_taken` pre-marks the name field. "Import skill" → `POST /skills {…draft, source}` without `trusted` (server default: untrusted) → `/skills/<id>?tab=preview`. Parse errors (422) show inline on the URL/file field.
- `SkillCard` (`components/skill-card/`, also used on `/skills/:id`): type badge, `#tag`s, trusted check (or "untrusted source" badge), enabled toggle (`PUT {enabled}`), `{n} agents`.
- States: 3 skeletons; `ErrorState` with retry; `EmptyState` only when the workspace has no skills (a search with no hits shows an empty grid).

## `/repos/:repoId/conventions` — conventions

`app/repos/[repoId]/conventions/page.tsx` → `ConventionsView`. Hooks: `useConventions`, `useStartConventionsScan`, `useUpdateConvention`, `useAttachConventions` (`lib/hooks/conventions.ts`), `useCreateSkill`. Server behaviour: [../../server/specs/conventions.md](../../server/specs/conventions.md).

- Header: `Conventions in <full_name>`, stats line `{accepted} accepted · {rejected} rejected · {inSkills} in skills`, Re-scan (only when there are items), "Create skill ({n})" — disabled while no accepted convention is outside a skill.
- Run extraction / Re-scan → `POST /repos/:id/conventions/scan` (202). The list refetches every 2 s while `scan.status` is `queued|running` (`CONVENTIONS_POLL_MS`), so leaving and returning keeps the scanning state. A 409 or other error → toast.
- A failed last scan (`scanError`): its message comes from `page.failed.codes.<error_code>` (`not_indexed | no_readable_files | llm_failed | timeout | interrupted | unknown`), with the raw server text as a "Details:" line (none for `interrupted`). With conventions on the page it is an alert above the list; without any it is an `ErrorState` whose Retry starts a new scan.
- Sections in order To review / Accepted / In skills / Rejected (`groupConventions`); empty sections are hidden.
- `ConventionCard`: rule, evidence `path:start-end` — a new-tab link to `evidence_url` (GitHub permalink at the scanned commit), plain text when it is null — snippet (`<pre>`), confidence. Pending: Accept / Reject / Edit; accepted: Reject / Edit; rejected: Accept. Edit is inline (Save disabled on empty text, unchanged text is not sent) → `PATCH /conventions/:id`. Cards in a skill are read-only with an "In skill" badge.
- `ConventionSkillModal`: a checklist of the accepted conventions outside a skill (all checked at first) above `SkillDraftFields` with `lockType` (type stays `convention`) and a 16-row body. Prefill: name `<repo>-conventions`, description, body = every selected rule + evidence path + full snippet in a fence longer than any backtick run inside it. The body follows the selection until it is edited by hand; then "Rebuild body from selection" re-applies it. Save is disabled with nothing selected. Save → `POST /skills {…, type: convention, source: extracted, evidence_files}` (selected only) then `POST /repos/:id/conventions/attach` with the selected ids — the unselected ones stay in Accepted for another skill. A 409 marks the name field; a failed attach shows an alert and the button becomes Retry, which re-sends only the attach.
- States (`emptyKind`): 3 skeletons; load `ErrorState` with retry; no conventions and `scan === null` → `EmptyState` "Run extraction"; last scan `done` with nothing → "No new conventions found" + Re-scan; last scan `failed` → the error state above; `RepoNotFound` for an unknown `:repoId`. All strings come from `messages/en/conventions.json`.

## `/skills/:id` — skill editor

`app/skills/[id]/page.tsx`, same two-pane layout as `/agents/:id`. `?tab` ∈ `config | preview | versions` (`SkillEditor/constants.ts`), fallback `config`. Header: name, type badge, `v{n}`, trusted badge, `disabled` badge.

- `ConfigTab`: name (required, kebab-case), description, type, tags (`components/tag-input`: Enter/comma adds, trim+lowercase, dedupe, Backspace removes last; from 3 typed characters a dropdown lists matching tags from `GET /skills/tags`, ↑/↓ + Enter or click), trusted checkbox, enabled toggle, `BodyEditor` (line-number gutter, `<name>.md`, `unsaved` when the body differs, `~N tokens` = `ceil(chars/4)`). Save → `PUT /skills/:id` with all fields; disabled only while pending or when nothing changed; invalid fields show inline; toast `v{n}`; a 409 marks the name field. The form resets when the skill or its active version changes. Delete → `window.confirm` (mentions the linked-agent count) → `DELETE /skills/:id` → `/skills`.
- `PreviewTab`: body through the `Markdown` primitive; notes when the skill is disabled or untrusted.
- `VersionsTab`: `GET /skills/:id/versions` newest-first, badges `active` (= `skill.version`) and `latest`; opens on the active version. Selecting one shows its snapshot (body as markdown). "Make active" (confirm) → `POST /skills/:id/versions/:v/activate`: the skill row takes that snapshot's content, no new version is recorded, linked agents get it from the next review. The header `v{n}` is the active version.

## `/settings/:section` — settings

`app/settings/[section]/page.tsx:5-7` → `SettingsView` (`SettingsView/SettingsView.tsx`). Sections come from `SETTINGS_SECTIONS` in `vendor/ui/nav.ts:39-42`: `api-keys` ("API Keys"), `models` ("Feature Models").

- `section = params.section ?? "api-keys"`; `current` = matching entry or the first one (20-21). `api-keys` → `SettingsApiKeys`, `models` → `SettingsModels`, anything else → `EmptyState` (38-48). For an unknown section the nav highlights nothing, the breadcrumb and the empty-state title use the **first** section's label ("API Keys") while the body is the generic fallback text (21, 24, 43-48).
- `SettingsApiKeys`: one row per `KEY_ROWS` entry — `openai`, `anthropic`, `openrouter`, `github` (`SettingsApiKeys/constants.ts:11-16`). A "Configured / Not set" badge comes from `GET /settings/secrets-status` (booleans only; hidden while loading, 14-23). The key input is `type=password` unless revealed (68). "Test connection" → `POST /settings/test-connection {provider, key}` where `key` is the trimmed input or omitted when empty (45-46); on `ok` with a typed key the input is cleared and un-revealed (51-54); the result message is shown inline (79-84); a thrown error shows `ApiError.message` or a generic string (56). Success invalidates `["provider-models"]` and `["secrets-status"]` (core:48-53).
- `SettingsModels`: one `SearchableSelect` per entry of `FEATURE_MODELS`; options come live from `GET /providers/openrouter/models`; current value = `settings.feature_models[id].model` else the registry default, tagged "using default" (`SettingsModels.tsx:24-41,53`). Change → `PUT /settings {feature_models: {...chosen, [id]: {provider: "openrouter", model}}}` (30-33); the response replaces `["settings"]` (core:34). The provider is hard-coded to `openrouter` on write. There is no loading/error UI: pickers render with defaults until data arrives, and an empty loaded list swaps the footnote to the "no key" text (28, 71).

## Global behaviours that every `AppShell` page inherits

- Shortcuts (`components/app-shell/hooks/useGlobalShortcuts.ts`): `⌘/Ctrl+K` palette (27-30); `?` help and `g`-then-key navigation are ignored while focus is in an input/textarea/contenteditable (32-33). `g` arms a `G_NAV_TIMEOUT_MS = 1200` window (`app-shell/constants.ts:4`); next key resolves against `NAV[].gKey` (`p` → `/repos/:repoId/pulls`, `a` → `/agents`) or `,` → `/settings/api-keys`.
- Sidebar PR badge = count of `needs_review` PRs of the active repo, hidden at 0 (`useShellContext.ts:75`). Removing a repo is `window.confirm`-guarded; if the active repo was removed it navigates to the next repo's PR list or `/onboarding` (44-54).
- Repo switch → `setRepoId` (persists `dd-repo`) then `/repos/:id/pulls` (31-37).
