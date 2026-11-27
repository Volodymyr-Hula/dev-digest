# e2e architecture

How the suite is wired and why. Usage, env knobs and the local run recipe live in [../README.md](../README.md); pinned contracts live in [../specs/](../specs/).

## Shape

```
scripts/e2e.sh ──► Postgres (docker) ─ migrate ─ seed ─► API ─► web   (E2E_* ports)
                                                                                  ▲
e2e/run.ts ──execFile──► agent-browser CLI ──CDP──► one Chrome session ───────────┘
   │  reads flows/NN-name.flow.json
   └► lib/assert.ts (types, {BASE} substitution, stdout check, summary)
```

`run.ts` is the only test logic. agent-browser is a CLI, not a framework: it has no test runner, so the package adds a JSON convention on top (`run.ts:1-18`).

## Isolated stack (`scripts/e2e.sh`)

Purpose: run against a DB where the seeded demo repo is the only repo (the home page redirects to `repos[0]`, `client/src/app/page.tsx:15-18`) without touching the dev DB or `devdigest_pgdata`.

| Step | What | Ref |
|------|------|-----|
| Config | `E2E_*` knobs ([README](../README.md#run-locally)); db/user/pass `devdigest` | `scripts/e2e.sh:26-33` |
| Env | `DATABASE_URL` (on `127.0.0.1`, not `localhost`), `API_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_BASE`, `E2E_BASE_URL` exported before any child starts. dotenv does not override set vars, so these beat `server/.env` without editing it | `:35-43` |
| Trap | `cleanup` is installed on `EXIT INT TERM` before anything starts; preserves the exit code | `:67-82` |
| Postgres | `docker run -d --rm`, no named volume, healthcheck `pg_isready`; polled up to 60 s | `:84-104` |
| Deps | `pnpm install` in `server/`, `client/` if `node_modules` missing; `npm ci` in `reviewer-core/` (API imports its raw source at runtime) | `:106-117` |
| Guard | refuses to migrate/seed unless `DATABASE_URL` contains `:<PG_PORT>/` | `:120-124` |
| Migrate + seed | `pnpm db:migrate`, `pnpm db:seed` in `server/` (scripts at `server/package.json:14-15`) | `:125-128` |
| API | `pnpm exec tsx src/server.ts` in background (no build, no watcher); polls `/health` up to 60 s, aborts if the process died | `:133-144` |
| Web | `pnpm exec next dev -p $WEB_PORT`; polls `/` up to 60 s | `:147-158` |
| Run | `(cd e2e && npm test)`, exit code captured with `set +e`, then re-raised through the trap | `:161-166` |
| Teardown | `kill_tree` walks children leaves-first (the real listener is a grandchild of `pnpm exec`), then reaps whatever still listens on the two isolated ports via `lsof`, then `docker rm -f` | `:57-81` |

The `E2E_*` ports differ from the dev ports ([root README](../../README.md)), so both can run at once. The API's CORS origin derives from `WEB_PORT` (`server/src/platform/config.ts:37,98,104`), which is why `WEB_PORT` is exported.

## Runner (`run.ts`)

1. **Load**: every `*.flow.json` in `flows/`, sorted lexically, `JSON.parse`d with no schema validation (`run.ts:53-61`). Zero flows exits 1 (`:98-101`).
2. **Run**: flows run sequentially; steps within a flow run sequentially (`:103-107`, `:68`).
3. **Step**: `{BASE}` is substituted (`lib/assert.ts:157-160`), then `execFile(BIN, args)` with cwd `e2e/`, per-command timeout `E2E_STEP_TIMEOUT` (60 s), 32 MiB stdout buffer (`run.ts:44-51`). Because agent-browser keeps a daemon, every command lands in the same browser session; page, cookies and storage carry across steps and across flows.
4. **Assert**: the only built-in assertion is exit code. `wait --text` / `wait --url` time out non-zero, so they are the assertions. Optional `assert.stdoutIncludes` is a substring check (`run.ts:73-77`, `lib/assert.ts:162-164`).
5. **Failure**: first failing step ends that flow (`break`), the remaining flows still run. On a thrown command error, a best-effort `screenshot test-results/<flow-id>-fail.png` is taken (`run.ts:80-88`); a `stdoutIncludes` mismatch does not take a screenshot (`run.ts:73-77`).
6. **Finish**: `agent-browser close` in `finally` (`:108-111`), then `summarize` prints PASS/FAIL per flow plus failed steps and `N/M flows passed` (`lib/assert.ts:166-178`).

Exit codes: `0` all flows passed; `1` any flow failed, no flows found, or runner crash (`run.ts:114`, `:100`, `:117-120`).

`agent-browser.json` sets headless and TLS verification on; it contains no timeouts or session names.

## Why no model call happens

Flows only read what `server/src/db/seed.ts` inserted: a repo, one PR, one pre-made review with two findings, one `pr_intent` row for that PR (`seed.ts`, "PR #482 intent": `source: 'model'`, medium confidence, an unfetched `PAY-482` ticket source), three agents. They never click Run Review, submit the onboarding form, or use agent-browser's AI `chat` command, and locators are `--url`/`--text`/`find`. The API also boots without keys: the CI header states `loadConfig()` marks every secret optional (`.github/workflows/e2e-web.yml:7-8`). Enforced as a rule in [../specs/flow-format.md](../specs/flow-format.md); fixture list in [../specs/seed-fixtures.md](../specs/seed-fixtures.md).

## Flow-authoring notes (from `flows/09-pr-intent.flow.json`)

- **`09-pr-intent` depends on the seeded intent.** It opens PR #482, expects the seeded summary, "Medium confidence" and the `PAY-482` source with "not fetched" on the Overview tab, then edits the summary and saves through `PUT /pulls/:id/intent` (no model call). Because it saves a user intent ("High confidence", "user" marker), it assumes a freshly seeded DB.
- **Scroll an off-screen control into view first.** The PR page scrolls inside an inner container, so a click on a control outside the viewport lands at off-viewport coordinates; the flow adds a `scrollintoview <css>` step before clicking Save (`flows/09-pr-intent.flow.json:17`). `scroll down` scrolls the window, not that container, and does not help.
- **`find label X fill` needs a real `<label>`.** It only resolves controls inside or associated with a `<label>`; that is why `IntentEditForm` wraps each control in one (`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentPanel/_components/IntentEditForm/IntentEditForm.tsx`).
- **Local runs may need agent-browser's Node on `PATH`.** If it was installed under another mise Node, `scripts/e2e.sh` only warns it is not found; see the `mise ERROR agent-browser is not provided by the active node` entry in root [INSIGHTS.md](../../INSIGHTS.md).

## CI (`.github/workflows/e2e-web.yml`)

CI does not call `scripts/e2e.sh` (`scripts/e2e.sh:17-18`); it builds an equivalent stack on the dev ports.

| Aspect | CI | `scripts/e2e.sh` |
|--------|----|------------------|
| Postgres | `docker compose up -d` (`devdigest-postgres`, dev port) on a fresh runner | `docker run --rm` on `E2E_PG_PORT` |
| API | tsx on the dev port, `/health` polled 30×2 s | tsx on `E2E_API_PORT` |
| Web | `pnpm build` + `pnpm start` on the dev port | `next dev` on `E2E_WEB_PORT` |
| Runner | `cd e2e && npm ci && npm test` | `npm test` |

Triggers: push to `main` and PRs touching `client/**`, `server/**`, `e2e/**` or the workflow file (`:11-24`). Concurrency cancels superseded runs per ref (`:29-31`). On failure, `e2e/test-results/**` is uploaded as artifact `e2e-failure` (`:122-129`). Freshness of the DB comes from the runner VM being new, not from any reset step. pnpm is pinned to 10 (`:45-47`). Path-filter gap for `reviewer-core/**`: root [INSIGHTS.md](../../INSIGHTS.md).
