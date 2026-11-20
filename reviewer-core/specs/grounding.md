# Spec — citation grounding

Source: `src/grounding.ts`. Pinned by `server/test/grounding.test.ts` (the only direct grounding tests; `reviewer-core/test/run.test.ts` covers it end to end). Invariants marked **[untested]** have no test.

## Line index (`buildLineIndex`, `grounding.ts:24-39`)

- G1. Per file, the groundable set is the union of each hunk's `newLineNumbers`; for the server's parser this includes **added and context lines**, never deleted lines (`server/src/adapters/git/diff-parser.ts:62-77`). Test: `grounding.test.ts:91-97`.
- G2. If a hunk's `newLineNumbers` is empty/missing, the set falls back to `newStart … newStart + max(newLines, 1) − 1` (`grounding.ts:32-34`). **[untested]**
- G3. The index is new-side only: a finding anchored to a deleted line cannot ground.

## Keep / drop rules (`groundFindings`, `grounding.ts:52-84`)

Evaluated per finding, in this order:

| # | Condition | Outcome | Reason string |
|---|---|---|---|
| R1 | `finding.file` not among `diff.files[].path` (exact string match) | drop | `file '<f>' not present in diff` (`:62`) |
| R2 | `kind` in `{secret_leak, lethal_trifecta, phantom, hook}` | keep (file presence is enough; lines ignored) | — |
| R3 | `[start_line, end_line]` shares at least one line with the file's set | keep | — |
| R4 | otherwise | drop | `lines S-E do not intersect any diff hunk in '<f>'` (`:78`) |

Tests: R1 `grounding.test.ts:56`, R2 `:62`, R3 `:41,:70`, R4 `:47` (asserts `/do not intersect/`).

Checkable invariants:
- G4. R1 is checked **before** R2: a full-file kind in a file absent from the diff is dropped. **[untested]**
- G5. `kind` of `finding`, `null` or `undefined` is a diff-finding (R3/R4 apply) (`:59`). **[untested]**
- G6. Intersection is inclusive and order-insensitive: `lo = min(start,end)`, `hi = max(...)` (`:42-45`), so a reversed range is handled. One shared line suffices — a range may extend past the hunk. **[untested]**
- G7. `kept` and `dropped` partition the input; order is preserved within each (`:56-81`). `groundingSummary` is `"<kept>/<total> passed"` (`:87-90`; test `:78`).
- G8. Grounding proves only that the *range* touches the diff, not that `end_line` is a diff line. Anything needing an exact anchor must re-resolve (see `resolveCommentLine`, `src/output/to-review.ts:107-122`; tests `to-review.test.ts:135-155`).
- G9. Grounding does not look at `severity`, `confidence`, or content; it never edits a finding.

## Position in the engine

- G10. Runs once, on the **reduced** findings, after all chunks (`run.ts:197`). Both modes use the same gate.
- G11. Every drop is surfaced: `ReviewOutcome.dropped` plus one `info` event per drop (`run.ts:199-201`). Test: `run.test.ts:60-69` (`1/2 passed`, one dropped).
- G12. Findings kept are exactly `outcome.review.findings`; the score is recomputed from them (see [review-contract.md](review-contract.md)).

## Open

- `grounding.ts:10-13` says full-file findings "are exempted entirely" in one clause; the code never exempts the file-presence check (R1). Treat the code as authoritative.
