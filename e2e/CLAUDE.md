# e2e — `@devdigest/e2e`

## Map

| Path | What |
|------|------|
| `run.ts` | runner: executes each flow's agent-browser commands in one browser session |
| `lib/assert.ts` | step result types + stdout assertions |
| `flows/NN-name.flow.json` | the test flows (picked up by the `.flow.json` suffix) |
| `agent-browser.json` | agent-browser CLI config |
| `../scripts/e2e.sh` | isolated stack: fresh Postgres + API + web, runs flows, tears down |
| `specs/` | pinned contracts: flow format, seed fixtures, coverage map — not test flows |
| `docs/` | architecture and data flow of the isolated stack and runner |

## Stack (e2e-only)

npm (`package-lock.json`) · Vercel agent-browser CLI (installed globally, drives Chrome over CDP) · tsx.

## Conventions

- Flow rules (deterministic locators, seeded data only, `NN-` numbering, assertions) live in [specs/flow-format.md](specs/flow-format.md); follow them for every flow.

## Gotchas

- Flows assume a freshly seeded DB with the demo repo as the only repo. Run them with `../scripts/e2e.sh`, which leaves the dev DB untouched.
- Failure screenshots land in `test-results/` (git-ignored, uploaded as a CI artifact).

## Pointers

- Read when writing a flow, running e2e locally or tuning env knobs: [README.md](README.md)
- Read when you need the overall test strategy: [../TESTING.md](../TESTING.md)
- Read when changing `run.ts`, `scripts/e2e.sh` or the CI workflow, or debugging how the stack boots and tears down: [docs/architecture.md](docs/architecture.md)
- Read when adding or editing a `*.flow.json` (schema, step kinds, assertions, ordering): [specs/flow-format.md](specs/flow-format.md)
- Read when changing `server/src/db/seed.ts` or a flow that depends on seeded data: [specs/seed-fixtures.md](specs/seed-fixtures.md)
- Read when adding a flow or checking which journey a flow covers: [specs/coverage.md](specs/coverage.md)
- Read before starting work here and update at the end of the task, via the `engineering-insights` skill: [INSIGHTS.md](INSIGHTS.md)
