# `apiFetch` / `api` contract

Source: `src/lib/api.ts`. Rationale and where it sits in the data flow: [../docs/ui-architecture.md](../docs/ui-architecture.md#data-flow).

## Base URL

- `API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:13001"` (`api.ts:5-6`). `next.config.mjs` repeats the same default and exposes it through `env.NEXT_PUBLIC_API_BASE`; the CSP `connect-src` is built from the same value, so changing the base also changes what the browser may reach.
- Every request is `fetch(API_BASE + path, …)` (24). Paths start with `/`.

## Request

- `content-type: application/json` is sent **only** when `init.body != null` (30; reason: [../CLAUDE.md](../CLAUDE.md) Gotchas). Caller-supplied `init.headers` are spread last and win (31).
- The `api` helper (65-74): `get`, `post`, `put`, `patch`, `del`. `post/put/patch` JSON-stringify `body` only when it is **truthy** (`body ? JSON.stringify(body) : undefined`), so `undefined`, `null`, `0`, `""` and `false` send no body. Pass objects.
- No auth header, no credentials option, no timeout/abort, no retries inside `apiFetch` (retry policy is TanStack's: `retry: 1`, `lib/providers.tsx:27`).

## Response

| Case | Result |
|------|--------|
| network failure (fetch throws) | throws `ApiError(message="Cannot reach the DevDigest engine at <API_BASE>. Is the API running?", status=0, code="network_error", details=<original error>)` (34-41) |
| `!res.ok` | reads JSON body; if `body.error` exists: `code=error.code`, `message=error.message ?? "<status> <statusText>"`, `details=error.details`. Non-JSON or no `error` key → message `"<status> <statusText>"`, no code. Throws `ApiError(message, res.status, code, details)` (44-59) |
| `204` | resolves `undefined` cast to `T` (61) |
| other 2xx | `res.json() as T` — **no runtime validation**; types are trusted (62) |

The server error envelope is defined in [server/specs/api-error-envelope.md](../../server/specs/api-error-envelope.md).

`ApiError` (8-19): `name = "ApiError"`, fields `status: number`, `code?: string`, `details?: unknown`.

## How errors surface (contract for callers)

- `status === 0` means "API unreachable"; `>= 500` means server fault. Both are toasted globally for **queries** (`lib/providers.tsx:36-39`); 4xx query errors are never toasted and must be handled inline (empty/error state).
- **Mutations** always toast (`providers.tsx:42`), whatever the status. A caller that also shows the error inline (e.g. `AddRepoView`, `SettingsApiKeys`) will therefore show both.
- Pages branch on `error instanceof ApiError ? error.message : <fallback>` for `ErrorState` bodies (`pulls/page.tsx:116`, `[number]/page.tsx:116`, `agents/[id]/page.tsx:46`).
- Runtime agent failures are not HTTP errors: they arrive as SSE `error` events and are toasted by `useRunEvents` (`hooks/reviews.ts:189`).

## Invariants

1. Components and hooks do not call `fetch` directly; HTTP goes through `apiFetch`/`api`. The only other network client is `EventSource` in `useRunEvents`, which uses the same `API_BASE` (`hooks/reviews.ts:181`).
2. Responses are typed with contracts from `@devdigest/shared` / `lib/types.ts` (re-exports, `types.ts:11-35`). Contract-copy drift: root [CLAUDE.md](../../CLAUDE.md) Gotchas.
3. Provider secrets are write-only: the UI only reads booleans from `GET /settings/secrets-status` (`hooks/core.ts:57-64`) and clears a typed key after a successful test (`SettingsApiKeys.tsx:51-54`).
