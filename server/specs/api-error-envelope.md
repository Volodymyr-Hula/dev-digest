# Spec — API error envelope and request guards

Every non-2xx response produced by the app's own code has one JSON shape, and every request passes the host/origin guard first. Refs are `server/src/…`. Design rationale: [../docs/architecture.md](../docs/architecture.md#http-boundary).

## Envelope

```ts
// vendor/shared/contracts/platform.ts:275  (ApiErrorBody)
{ error: { code: string; message: string; details?: unknown } }
```

- **EE-1** Clients may rely on `error.code` (stable machine string) and `error.message` (human text); `details` is optional and shape-free.
- **EE-2** `ApiErrorBody` is a shared contract; changes follow root [CLAUDE.md](../../CLAUDE.md) Gotchas. The client's parsing of it is [client/specs/api-client.md](../../client/specs/api-client.md).

## Error handler mapping (`app.ts:130-178`)

Evaluated top to bottom; first match wins. The handler is registered before the modules so encapsulated plugins inherit it.

| # | Condition | Status | `code` | `message` | `details` |
|---|-----------|--------|--------|-----------|-----------|
| 1 | zod type-provider request validation failure (`hasZodFastifySchemaValidationErrors`, `:132`) | 422 | `validation_error` | `Request validation failed` | `err.validation` |
| 2 | response failed its serializer schema (`isResponseSerializationError`, `:144`) | 500 | `internal_error` | `Internal error` (fixed; raw object never leaked, error logged) | — |
| 3 | `ZodError` by `instanceof` **or** by shape `name==='ZodError' ∧ issues/errors array` (`:153`) | 422 | `validation_error` | `Request validation failed` | `issues ?? errors` |
| 4 | `AppError` (`:167`) | `err.statusCode` | `err.code` | `err.message` | `err.details` |
| 5 | anything else (`:173-177`) | `err.statusCode ?? 500` | `internal_error` | `err.message ?? 'Internal error'` | — |

- **EE-3** Row 3's shape match must be kept (reason: [../CLAUDE.md](../CLAUDE.md) Gotchas). It also covers manual `.parse` calls such as `RunRequest.parse` (`reviews/routes.ts:32`).
- **EE-4** Row 5 preserves a framework-supplied `statusCode` (e.g. malformed JSON or oversized body; the rate-limit 429 path was not verified) but reports `code: 'internal_error'` and passes the raw `message` through. Treat the status, not the code, as authoritative for these.
- **EE-5** Unmatched routes: the app does not call `setNotFoundHandler` (no match in `src/`), so 404 for an unknown path is Fastify's default body, **not** this envelope. Domain 404s thrown as `NotFoundError` are enveloped.

### `AppError` taxonomy (`platform/errors.ts`)

| Class | Status | `code` |
|-------|--------|--------|
| `AppError(code, message, status=400, details?)` | 400 default | caller-chosen |
| `NotFoundError` (`:19`) | 404 | `not_found` |
| `ValidationError` (`:25`) | 422 | `validation_error` |
| `ExternalServiceError` (`:31`) | 502 | `external_service_error` |
| `ConfigError` (`:37`) | 500 | `config_error` |

- **EE-6** Code throws `AppError` subclasses and lets the handler map them; routes do not hand-build error bodies (guard and `/health/ready` are the only exceptions, below).
- **EE-7** Ad-hoc codes currently in use (all 400): `invalid_repo_url` (`repos/helpers.ts:29`, `repos/service.ts:54`), `invalid_run_request` (`reviews/service.ts:56`), `invalid_action` (`reviews/findings.ts:32`), `github_unavailable` (`pulls/routes.ts:322`), `github_comment_failed` (`:339`, `details.cause`). Missing LLM/GitHub secrets surface as `config_error` 500 (`platform/container.ts:159,198,206,213`); LLM structured-output failure as `external_service_error` 502 (`adapters/llm/openai.ts:132`, `anthropic.ts:147`).
- **EE-8** Path params named `:id` that address DB rows are validated as uuid via `IdParams` (`modules/_shared/schemas.ts`), so a malformed id is a 422 `validation_error`, not a 404/500. `/providers/:id` is the documented exception (provider name).

## Pre-handler guard (`app.ts:92-101`, `platform/local-only.ts`)

An `onRequest` hook, registered before helmet/cors, so it covers `/health*`, CORS preflights and every module route.

- **EE-9** `Host` hostname (port stripped, lowercased, trailing dot removed, IPv6 brackets handled; `local-only.ts:20`) must be in `config.allowedHosts` = `localhost`, `127.0.0.1`, `::1` + `API_ALLOWED_HOSTS` (`platform/config.ts:89-97`). Else `403 { error: { code: 'forbidden_host', message } }`. A missing/empty `Host` is rejected.
- **EE-10** `Origin`, when present, must equal (case-insensitive, trailing `/` ignored) one of `http://localhost:<WEB_PORT>` or `http://127.0.0.1:<WEB_PORT>` (`config.ts:98`, `local-only.ts:42`). Else `403 forbidden_origin`. Absent `Origin` passes (curl, MCP, CLI).
- **EE-11** Guard bodies carry no `details` and are sent directly from the hook, not through the error handler.
- **EE-12** `API_ALLOWED_HOSTS` extends only the Host allowlist; origins are derived solely from `WEB_PORT`.
- **EE-13** The server binds `API_HOST` (default `127.0.0.1`) and logs a warning when it is not loopback (`server.ts:31-35`). With no authentication (root [CLAUDE.md](../../CLAUDE.md) Gotchas), the guard is the only cross-site protection.

## Other transport invariants

- **EE-14** Request bodies are capped at 1 MiB (`app.ts:50`).
- **EE-15** Global rate limit 120/min, registered only when `NODE_ENV !== 'test'` (`app.ts:109-111`); route-level `config.rateLimit` still applies in tests. `/health`, `/health/ready` and `GET /runs/:id/events` set `rateLimit: false`; `POST /pulls/:id/review` is 10/min (`reviews/routes.ts:29`).
- **EE-16** `GET /health` → `200 { status: 'ok' }` with no DB access; `GET /health/ready` runs `select 1` and returns `200 { ready: true }` or `503 { ready: false }` (not the envelope) (`app.ts:114-126`).
- **EE-17** Success statuses worth pinning: `POST /repos` 201/200 (`repos/routes.ts:29`), `POST /agents` 201 (`agents/routes.ts:105`), `POST /repos/:id/resync` 202 even when enqueue failed (`repo-intel/routes.ts:60`, body `{status:'accepted', degraded:true, reason:'no_handler'}`).

## Tests

`test/routes-smoke.test.ts:56` (422 structured error), `test/local-only.test.ts` (guard, rebinding, foreign origin on POST), `test/contracts.test.ts`.
