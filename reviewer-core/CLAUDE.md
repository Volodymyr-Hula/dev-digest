# reviewer-core — `@devdigest/reviewer-core`

## Map

| Path | What |
|------|------|
| `src/index.ts` | the public API — everything consumers may import |
| `src/review/run.ts` | `reviewPullRequest()` — engine entry: single-pass or map-reduce |
| `src/review/reduce.ts` | merge partial reviews, slice per-file diff, score from findings |
| `src/prompt.ts` | `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD` |
| `src/grounding.ts` | citation gate: drop findings that don't cite a real diff line |
| `src/llm/structured.ts` | Zod → JSON Schema, parse-with-repair |
| `src/llm/openrouter.ts` | `OpenRouterProvider` (OpenAI-compatible) |
| `src/output/to-review.ts` | grounded Review → GitHub review payload (CI path) |

## Stack (reviewer-core-only)

npm (`package-lock.json`) · `openai` 4 as the OpenRouter client · zod resolved from this package's own `node_modules` via a tsconfig path alias.

## Conventions

- Pure logic: the only side effect is the injected `LLMProvider`. DB, filesystem, GitHub and persistence stay in the caller.
- Export anything new through `src/index.ts`; consumers import only from there.
- `build` is a type-check; the package ships TypeScript source and never emits JS.

## Gotchas

- Types come from `../server/src/vendor/shared`, so this package type-checks only inside a full checkout.
- Run `npm install` here even though `server/` consumes the source: the zod alias points at `reviewer-core/node_modules/zod`.
- `verdict` is the model's and is never adjusted after grounding, while `score` is recomputed; see [specs/review-contract.md](specs/review-contract.md) C9–C10.

## Pointers

- Read when you need the one-glance pipeline diagram: [README.md](README.md)
- Read when changing prompt assembly, the severity/verdict rules or the `Review` contract: [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
- Read when writing or running tests: [../TESTING.md](../TESTING.md)
- Read when you need to understand how a review flows (single-pass vs map-reduce, prompt assembly, repair, grounding, scoring, server consumption): [docs/pipeline.md](docs/pipeline.md)
- Read when changing the grounding gate or anything that decides whether a finding is kept or dropped: [specs/grounding.md](specs/grounding.md)
- Read when changing `src/index.ts`, `ReviewInput`/`ReviewOutcome`, mode thresholds, reduce, score/verdict handling or the CI gate: [specs/review-contract.md](specs/review-contract.md)
- Read when changing `prompt.ts`, `INJECTION_GUARD`, `wrapUntrusted`, `structured.ts` or the provider's repair loop: [specs/prompt-and-structured-output.md](specs/prompt-and-structured-output.md)
- Read before starting work here and update at the end of the task, via the `engineering-insights` skill: [INSIGHTS.md](INSIGHTS.md)
