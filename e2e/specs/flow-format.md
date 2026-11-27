# Flow format

Contract between `flows/*.flow.json` and the runner. Each item is an invariant; change code and this file together.

## File

- F1. A flow is a file `flows/NN-name.flow.json`; discovery is by the `.flow.json` suffix only (`run.ts:55`). `NN` is a two-digit prefix (all 8 current files follow it).
- F2. Run order is `Array.sort()` of filenames (`run.ts:56`), so `NN` must be zero-padded or `10-` would run before `2-`. Flows must not depend on each other's side effects; the browser session is shared (`run.ts:3-9`) but every flow starts with its own `open` (all current flows do).
- F3. Content is parsed with bare `JSON.parse`, no schema check (`run.ts:59`). Malformed JSON or a missing `steps` aborts the whole run with exit 1 (`run.ts:117-120`). Keep the file strict JSON (no comments; the `jsonc` block in README is illustrative).

## Schema (`lib/assert.ts:128-142`)

| Field | Type | Required | Used by runner |
|-------|------|----------|----------------|
| `name` | string | yes | log header and summary (`run.ts:65`, `lib/assert.ts:169`) |
| `description` | string | no | never read; documentation only |
| `steps` | `Step[]` | yes | executed in order |
| `steps[].cmd` | `string[]` | yes | argv passed to agent-browser unchanged |
| `steps[].label` | string | no | log text; defaults to `cmd` joined by spaces (`run.ts:70`) |
| `steps[].assert.stdoutIncludes` | string | no | substring check on stdout (`run.ts:73`) |
| `steps[].assert.stdoutInOrder` | string[] | no | every string must occur in stdout, each after the end of the previous one (`stdoutContainsInOrder`, `lib/assert.ts`; `run.ts`) |

No other fields exist. There are two assertion kinds, both case-sensitive: `stdoutIncludes` is `String.includes` (`lib/assert.ts` `stdoutContains`); `stdoutInOrder` checks relative position and is for *order*, e.g. the Smart-diff group order read with `get text [data-testid="smart-diff-groups"]` (flow `10`). When both are set, both must hold. `stdoutInOrder` proves order only when each needle is unique enough not to occur earlier in the text (e.g. in a description); pick needles accordingly.

## Step kinds in use

The runner does not restrict `cmd[0]`; any agent-browser subcommand is accepted. The flows use only these:

| `cmd` shape | Role | Fails when |
|-------------|------|-----------|
| `open <url>` | navigate | command exits non-zero |
| `wait --url <substr>` | assert current URL | not matched within timeout |
| `wait --text <text>` | assert rendered text present | not matched within timeout |
| `wait --load networkidle` | let fetches settle before the next step | not reached within timeout |
| `find text <text> click` | click by visible text | no match |
| `find role button click --name <name>` | click by role + accessible name | no match |
| `get text <selector>` | read an element's text for an `assert` (`stdoutIncludes` / `stdoutInOrder`); the only step kind whose stdout is checked | selector matches nothing, or the assert fails |

Rules:
- F4. Deterministic locators only: `--url`, `--text`, `find role|text|label`. The AI `chat` command is forbidden (no flow uses it). This file is the single home of this rule.
- F5. A step passes iff the command exits 0 and, for each assert that is set, stdout satisfies it: `stdoutIncludes` contains it, `stdoutInOrder` has every string in order (`run.ts:72-84`). A passing `wait` is the assertion; do not add a step whose only purpose is to sleep.
- F6. Timeout is per command: `E2E_STEP_TIMEOUT`, default 60000 ms (`run.ts:41,47`). A killed command surfaces as a failed step with the first line of the error (`run.ts:81`).
- F7. `{BASE}` in any `cmd` element is replaced with `E2E_BASE_URL` (default `http://localhost:13000`) with trailing slashes trimmed, so write `{BASE}/path` (`lib/assert.ts:157-160`, `run.ts:39`). Use it for every absolute URL; never hardcode a port.
- F8. `wait --text` matches rendered text, not the i18n string: a CSS-uppercased header must be matched as `COST` (`flows/02-repo-pulls-detail.flow.json:8`; `client/src/app/repos/[repoId]/pulls/styles.ts:105`).

## Failure semantics

- F9. The first failing step stops its flow; later flows still run (`run.ts:75,87`).
- F10. A thrown error triggers a best-effort screenshot `test-results/<NN-name>-fail.png` (`run.ts:85-86`). A `stdoutIncludes` / `stdoutInOrder` mismatch breaks without a screenshot (`run.ts:73-82`).
- F11. Exit `0` iff every flow passed (`run.ts:114`); `1` otherwise, including zero flows (`run.ts:98-101`).

## Authoring checklist

1. Read seeded data only; list every fixture the flow needs in [seed-fixtures.md](seed-fixtures.md) and add the row to [coverage.md](coverage.md).
2. Never submit forms or press Run Review (no mutation, no model call). `06-onboarding` stops before submit.
3. After a navigation click, `wait --url` then `wait --load networkidle` before asserting text (pattern in `02`, `04`, `05`).
4. Give every step a `label` that reads as the assertion.
