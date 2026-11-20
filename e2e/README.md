# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows for the web app, driven by
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser) — a
native (Rust + CDP) browser-automation CLI. **No Playwright, no LLM, no API key.**

agent-browser is a CLI, not a test framework, so this package adds a thin
convention: each flow is a JSON list of agent-browser commands, run in order
against one shared browser session by `run.ts`.

## How a flow works

A flow lives in `flows/NN-name.flow.json`:

```jsonc
{
  "name": "App boots and lands on the seeded repo's PR list",
  "steps": [
    { "cmd": ["open", "{BASE}/"],            "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"],    "label": "root redirects to PRs" },
    { "cmd": ["wait", "--text", "#482"],     "label": "seeded PR row visible" }
  ]
}
```

Fields, step kinds, `{BASE}` substitution and failure semantics are specified in
[`specs/flow-format.md`](specs/flow-format.md). The seeded data the flows read is
in [`specs/seed-fixtures.md`](specs/seed-fixtures.md).

> **Precondition: a freshly seeded DB where the demo repo is the only repo**
> ([S1](specs/seed-fixtures.md#preconditions)). Your dev DB usually fails this,
> so use the hermetic runner below.

## Run locally

```sh
# 1. install the agent-browser CLI once (downloads Chrome for Testing)
npm i -g agent-browser && agent-browser install
```

### Hermetic (recommended)

```sh
# Boots an isolated, freshly-seeded stack on alternate ports
# (see env knobs below), runs the flows, then tears it all
# down. Safe to run while your normal dev stack is up — it never touches your
# dev DB or the devdigest_pgdata volume.
./scripts/e2e.sh
# or: cd e2e && npm install && npm run e2e:hermetic
```

The isolated Postgres is ephemeral (no persistent volume), so it's empty every
run and the seeded demo repo `acme/payments-api` is the only one — which is
exactly what flows 02/04/05 need.

### Against your own running stack

Only safe if your dev DB contains *only* the seeded repo (see precondition
above). Otherwise prefer the hermetic runner.

```sh
./scripts/dev.sh          # dev stack (seeded)
cd e2e && npm install && npm test
```

Env knobs:

- Runner: `E2E_BASE_URL`, `AGENT_BROWSER_BIN` (default `agent-browser`),
  `E2E_STEP_TIMEOUT` (ms, default 60000).
- Hermetic stack (`scripts/e2e.sh`): `E2E_PG_PORT` (5433), `E2E_API_PORT` (3101),
  `E2E_WEB_PORT` (3100), `E2E_PG_CONTAINER` (`devdigest-e2e-postgres`),
  `E2E_PG_IMAGE` (`pgvector/pgvector:pg16`).

## Coverage

Which flow covers which journey: [`specs/coverage.md`](specs/coverage.md).
