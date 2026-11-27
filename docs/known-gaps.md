# Known gaps

Known defects that are not fixed yet. Each entry: symptom, cause, impact, workaround, fix direction. Remove an entry in the change that fixes it.

## 1. Anthropic adapter rejects current Claude models

**Symptom.** Any structured call (review, PR intent, conventions) on `provider=anthropic` with Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 or Fable 5.1+ fails with `400 … tool_choice: type "tool" and "any" are not supported for this model.`

**Cause.** `AnthropicProvider.completeStructured` forces tool use (`tool_choice: { type: 'tool', name }`, `server/src/adapters/llm/anthropic.ts:115`) and sends `temperature: 0` (`:107`). These models reject both. `@anthropic-ai/sdk` is pinned at `^0.33.1` (`server/package.json:18`), which predates `output_config.format`.

**Impact.** Current Claude models can't be used for any feature model or agent. Only legacy rows (`claude-3-5-*`) work. `claude-haiku-5-5` can be selected in Settings and has a pricing row, but every call fails.

**Workaround.** Use the `openai` or `openrouter` providers. The PR intent classifier defaults to `openrouter` / `deepseek/deepseek-v4-flash`.

**Fix direction.** Upgrade the SDK (`pnpm add @anthropic-ai/sdk@<version>` in `server/`, which updates the lockfile with it). Replace the forced tool with `output_config.format` json_schema. Stop sending a non-default `temperature` to models that reject it. Keep the zod validate + reprompt loop.

## 2. Running e2e breaks the dev web app

**Symptom.** After `./scripts/e2e.sh`, the dev web app on :13000 calls the e2e API (console: `Connecting to 'http://localhost:3101/repos' violates the following Content Security Policy directive`) and pages that exist return 404.

**Cause.** e2e starts a second `next dev` in the same `client/` folder (`scripts/e2e.sh:148`) with `NEXT_PUBLIC_API_BASE` pointing at the e2e API (`:42`). Both servers share `client/.next`, so the e2e build overwrites the dev build's compiled env and route cache.

**Impact.** The dev environment silently points at a stopped e2e stack after every e2e run.

**Workaround.** Restart the dev client (`pnpm dev` in `client/`) after an e2e run.

**Fix direction.** Give the e2e web server its own build dir, e.g. a `distDir` read from an env var in the Next config that `e2e.sh` sets, so the two servers never share `.next`.

## 3. `PrDetail.linked_issue` is wrong and unused

**Symptom.** `GET /pulls/:id` returns a `linked_issue` that is often not the PR's ticket. It is the first `#<digits>` anywhere in the body (`See step #2`), an issue with the same number in this repo for `other-org/lib#45`, or a PR, since GitHub serves PRs as issues. A real `fixes #301` loses to an earlier `#300`.

**Cause.** `OctokitGitHubClient.resolveLinkedIssue` matches `/(?:closes|fixes|resolves)?\s*#(\d+)/i` with the keyword optional, takes the first match, and calls `getIssue` on the current repo. Errors are swallowed (`server/src/adapters/github/octokit.ts:127-135`).

**Impact.** Nothing reads the field: it is not persisted, the client doesn't use it outside `vendor/shared`, and reviews don't see it. Each `getPullRequest` still spends one extra GitHub API call on it (`octokit.ts:91`). That covers opening a PR page (`server/src/modules/pulls/routes.ts:213`) and up to 10 diff-stat backfills per PR-list request (`routes.ts:96`). PR intent does not use it; it extracts references itself (`specs/intent-layer.md`).

**Workaround.** None needed. Don't build on `linked_issue`.

**Fix direction.** Delete `resolveLinkedIssue` and its call, the `linked_issue` field of `PrDetail` in `server/src/vendor/shared/contracts/platform.ts:213` plus its client mirror (`client/src/vendor/shared/contracts/platform.ts:213`), and `linked_issue: null` in `server/src/adapters/mocks.ts:185`. Keep `IssueMeta` and `getIssue`, because PR intent uses them.

## 4. PR intent source bookkeeping is incomplete

**Symptom.** The intent panel's sources list omits some linked material, and a few caps are not flagged.

**Cause.** In `server/src/modules/intent/helpers.ts`:
- `extractReferences` records an external link only when its path ends in `.md` (`:117-119`), so other non-github.com links get no `external_link` source (spec FR-010).
- The commit-subject and changed-path caps are applied in `buildIntentInputs` (`:225-229`), but the `commits` and `paths` sources are always `used` (`modules/intent/service.ts:250-255`), never `truncated` (FR-011).
- `computeConfidence` counts a `truncated` target issue as used (`:174-191`), so it still yields `high`; FR-016 names only `used` for a target issue.
- `inputHash` leaves out changed paths and diff stats (`:299-311`, deliberately: the head sha covers them), while the spec describes it as covering the normalised capped inputs.

**Impact.** Cosmetic or slightly generous: the source list is less complete than specified, and a cut-off issue can raise confidence.

**Workaround.** None needed.

**Fix direction.** Record every external host, mark capped commits/paths `truncated`, and decide whether a truncated target issue should count as `high`. Also add a test for the derive rate limit (10 per minute, `server/src/modules/intent/routes.ts:27`); no test in `server/test/intent*.test.ts` exercises it.
