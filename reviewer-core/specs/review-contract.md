# Spec — review contract (public API and outcome)

Pinned by `test/run.test.ts`, `test/to-review.test.ts`, `test/prompt.test.ts`. **[untested]** marks invariants with no test. Types `Review`, `Finding`, `Verdict`, `UnifiedDiff`, `LLMProvider` come from `@devdigest/shared` (`server/src/vendor/shared`), not from this package.

## Public API (`src/index.ts` — the only import surface)

| Export | Source | index.ts |
|---|---|---|
| `assemblePrompt`, `wrapUntrusted`, types `PromptParts`, `AssembledPrompt` | `prompt.ts` | 15-20 |
| `groundFindings`, `groundingSummary`, type `GroundingResult` | `grounding.ts` | 23 |
| `toJsonSchema`, `extractJson`, `parseWithRepair`, types `JsonSchema`, `ParseResult` | `llm/structured.ts` | 26-32 |
| `reduceReviews`, `sliceDiff` | `review/reduce.ts` | 35 |
| `reviewPullRequest`, `DEFAULT_MAP_THRESHOLD_LINES`, `DEFAULT_REVIEW_MAX_RETRIES`, types `ReviewInput`, `ReviewOutcome`, `ReviewEvent`, `ReviewStrategy`, `ReviewMode` | `review/run.ts` | 38-47 |
| `toReviewPayload`, `gateTriggered`, `countBlockers`, type `ToReviewOptions` | `output/to-review.ts` | 50-55 |
| `OpenRouterProvider`, type `OpenRouterProviderOptions` | `llm/openrouter.ts` | 59 |

- C1. Not exported (internal): `INJECTION_GUARD`, `scoreFromFindings`, `buildLineIndex`, `SEV_RANK`, `FAIL_ON_MIN_RANK`. Consumers must not deep-import them.
- C2. The package performs no I/O except calling `input.llm.completeStructured` (and `OpenRouterProvider`'s own HTTP).

## `ReviewInput` (`run.ts:44`)

Required: `systemPrompt`, `model`, `diff`, `llm`. Optional: `strategy` (default `'auto'`), `skills`, `memory`, `specs`, `callers`, `repoMap`, `prDescription`, `task`, `maxRetries` (default 2), `mapThresholdLines` (default 400), `sessionId`, `onEvent`, `checkCancelled`.

- C3. `sessionId`, when set, is on **every** `completeStructured` call; omitted otherwise (`run.ts:180`). Test: `run.test.ts:107-136`.
- C4. `checkCancelled` is called before each chunk's LLM call; if it throws, the error propagates unchanged and no call is made (`run.ts:164`). Test: `run.test.ts:91-105`.
- C5. Each call uses `schema: Review`, `schemaName: 'Review'`, `messages` from `assemblePrompt`, and `maxRetries` (`run.ts:174-181`). `temperature` is not set by the engine (provider default 0, `openrouter.ts:72`). **[untested]**

## Mode selection (`selectMode`, `run.ts:115-121`)

- C6. `single-pass` → single-pass. `map-reduce` → map-reduce iff `files.length > 1`. `auto` → map-reduce iff `Σ(additions+deletions) > threshold` (strict) **and** `files.length > 1`. Default threshold `400`. **[untested]** (only single-pass runs are tested).
- C7. Map-reduce: one chunk per `diff.files[]` entry, diff text from `sliceDiff`; single-pass: one chunk labelled `'all files'` with `diff.raw` (`run.ts:144-147`).

## `ReviewOutcome` (`run.ts:95`)

- C8. `review.findings` are exactly the findings that survived grounding, in reduced order. Test: `run.test.ts:62-64`.
- C9. `review.score = scoreFromFindings(kept)`; the model's score is ignored. Penalties: CRITICAL 35, WARNING 12, SUGGESTION 3; result clamped to `[0,100]`; no findings → 100 (`reduce.ts:13-30`). Tests: one CRITICAL left → 65 (`run.test.ts:60-67`), model score 10 with no findings → 100 (`:72-89`). Other weights/clamp **[untested]**.
- C10. `review.verdict` and `review.summary` come from the reduced model output and are **not** adjusted after grounding (`run.ts:208`). Consequence: all findings dropped can still yield `verdict: 'request_changes'` with score 100. **[untested]**; documented as intended in `docs/agent-prompts/README.md`.
- C11. `grounding` is `"<kept>/<total> passed"`; `dropped` carries `{finding, reason}`; `mode` is the chosen mode.
- C12. `tokensIn/tokensOut` are sums over chunks; `costUsd` is the sum, or `null` if any chunk returned `null` (`run.ts:184`). `raw` is chunk raws joined with `\n---\n`. **[untested]**
- C13. `events`: `info` (mode), `tool` (per chunk), `result` (per chunk, reduce, grounding), `info` (per drop). Test only asserts a message containing `Citation grounding` (`run.test.ts:69`).

## Reduce (`reduceReviews`, `reduce.ts:43-55`) — all **[untested]**

- C14. One partial → returned as is (same object).
- C15. Otherwise: findings concatenated in partial order (no dedup); verdict = worst by `request_changes > comment > approve`; score = `Math.round(mean)`; summary = non-empty summaries joined by a space. Empty array → `approve`, score 0, no findings (`:50-52`).
- C16. `sliceDiff` returns every `diff --git` block whose header line includes `b/<path>` or ` <path>`; if none matches it returns a header-only stub for a known path, or `diff.raw` for an unknown one (`:58-72`). Matching is substring-based, so a path that is a prefix of another (`a.ts` / `a.ts.bak`) can over-capture; open.

## Repair / structured output

See [prompt-and-structured-output.md](prompt-and-structured-output.md).

## CI gate and payload (`output/to-review.ts`)

- C17. The GitHub event ignores `review.verdict`: no findings → `APPROVE`; `gateTriggered(findings, failOn)` → `REQUEST_CHANGES`; else `COMMENT` (`:156-161`). `failOn` defaults to `'critical'`. Tests: `to-review.test.ts:29-70`.
- C18. Gate floor by policy: `never` ∞, `critical` 3, `warning` 2, `any` 1 (`:26-31`); `countBlockers` counts findings with rank ≥ floor, and agrees with `gateTriggered` (tests `:73-90`, `:157+`).
- C19. With `opts.diff`, each inline comment anchors to the new-side diff line within `[start,end]` closest to `end_line`; none → no inline comment, finding stays in the body. Without `diff`, anchor is raw `end_line` (`:107-122`, `:133-143`). Tests `to-review.test.ts:135-155`.
