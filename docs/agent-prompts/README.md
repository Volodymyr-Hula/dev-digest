# Writing agent prompts

How a review agent's `system_prompt` is turned into the messages a model sees, and
the conventions that keep findings, scores, and verdicts consistent.

These are the prompts that drive each reviewer agent (stored on `agents.system_prompt`
in the DB). The canonical, reviewable copies live next to this file:

- [`general-reviewer.md`](./general-reviewer.md)
- [`security-reviewer.md`](./security-reviewer.md)
- [`performance-reviewer.md`](./performance-reviewer.md)
- [`api-contract-reviewer.md`](./api-contract-reviewer.md)

> The DB is the source of truth at run time. These files are the human-readable
> originals — when you change a prompt, edit the file here **and** push it to the
> agent (`PUT /agents/:id`, which versions the change into `agent_versions`).

## How a prompt is assembled

Your `system_prompt` becomes the system message, followed by a fixed
`INJECTION_GUARD` that the engine appends on every run. All PR and repo context
goes into the user message, and the repo- and author-derived parts are wrapped as
`<untrusted>` data. So your prompt never needs to restate the anti-injection rule,
and it should not describe the context layout.

The exact message layout, section order, wrapping and truncation rules are in
[`reviewer-core/specs/prompt-and-structured-output.md`](../../reviewer-core/specs/prompt-and-structured-output.md);
the design reasons are in [`reviewer-core/docs/pipeline.md`](../../reviewer-core/docs/pipeline.md#prompt-assembly-and-the-injection-guard).

## The output schema is NOT in the prompt

This is the most common source of confusion. The structure of the response — the
`{ verdict, summary, score, findings[] }` object and every field type — is enforced
**out of band** by the provider, not by prompt text:

```ts
// reviewer-core/src/llm/openrouter.ts
response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }
```

The schema is the Zod `Review` contract in
`server/src/vendor/shared/contracts/findings.ts`, converted to JSON Schema and sent
as a separate API parameter. In `strict` mode the model **cannot** return anything
that doesn't match it. Consequences for prompt authors:

- **Do not describe the JSON shape, field names, or a markdown layout in the prompt.**
  It is redundant at best and actively harmful when it disagrees with the schema
  (e.g. a prompt that asks for `### [SEVERITY]` markdown sections while the schema
  demands a JSON object — the model gets two conflicting specs and produces garbage
  in the fields the prompt didn't pin down).
- **Use the schema's own vocabulary.** Severity is exactly `CRITICAL | WARNING |
  SUGGESTION`. Verdict is exactly `request_changes | approve | comment`. Do not
  introduce a different scale ("High/Medium/Low") in the prompt — the model will map
  it onto the enum inconsistently and inflate severities.
- **Field *meaning* belongs in the schema's `.describe()`, field *judgment* belongs
  in the prompt.** The prompt's job is to tell the model *what to flag and at what
  severity*, and *when each verdict applies* — not what the JSON looks like.

## Required conventions (every reviewer prompt)

Every reviewer prompt must end with three blocks, because the engine derives
numbers and gates from what the model returns:

1. **Severity rubric** mapped to the three enum levels, with an explicit
   anti-inflation rule. Only `CRITICAL` blocks merge, so a model that calls
   everything CRITICAL turns every PR into a blocker. State plainly that speculative
   issues ("might be", "if not already handled") are at most `WARNING`.

2. **Verdict semantics.** The model owns `verdict`, so it must be told the mapping:
   `request_changes` ⇔ at least one CRITICAL; `comment` ⇔ only non-blocking
   findings; `approve` ⇔ empty findings list. **No findings ⇒ approve.** Without
   this, models default `verdict` arbitrarily (we have observed `request_changes`
   returned with zero findings and a summary saying "no issues found").

3. **Findings discipline.** No duplicate findings; no padding toward a count. There
   is no minimum or target — zero is a good answer. Models treat "return at most N
   findings" as a quota and pad the list with repeats to hit N, which also corrupts
   the score. State that the count is free and repeats are forbidden.

## How the engine uses the output (why the conventions matter)

What this means for a prompt author:

- **Severities drive the number.** The engine ignores the model's `score` and
  recomputes it from the surviving findings' severities. Inflated severities
  therefore mean a lower score and more blockers.
- **Cite real diff lines.** A finding whose range does not touch the diff is
  dropped by the grounding gate before it is persisted.
- **The verdict is load-bearing.** The engine passes the model's `verdict` through
  unchanged, so the verdict convention above is the only thing keeping it right.
- **The CI gate ignores the verdict.** It is decided from finding severities
  (`agents.ciFailOn`, default `critical`), so honest severities keep it working.

The exact rules (penalty weights, grounding, verdict passthrough, gate thresholds)
are in [`reviewer-core/specs/review-contract.md`](../../reviewer-core/specs/review-contract.md)
and [`reviewer-core/specs/grounding.md`](../../reviewer-core/specs/grounding.md).

## Checklist before shipping a prompt

- [ ] Role + concrete "what to look for", in priority order.
- [ ] "Analyze along the execution path; state the mechanism" guidance.
- [ ] Quality bar: precision over volume; empty list is allowed.
- [ ] Severity rubric using `CRITICAL/WARNING/SUGGESTION` + anti-inflation rule.
- [ ] Verdict mapping incl. "no findings ⇒ approve".
- [ ] Findings discipline: distinct only, no count target.
- [ ] No JSON shape / markdown layout / alternate severity scale described in prose.
- [ ] No "return at most N findings" quota.
- [ ] File updated here **and** pushed to the agent (versioned).
