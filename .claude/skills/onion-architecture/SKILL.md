---
name: onion-architecture
description: Enforces the onion layering of server/ (@devdigest/api) — route → service → repository/domain, wired through the Container; external systems (git, GitHub, code index, LLM, embeddings, secrets) only as adapters at the edge behind ports; dependencies point inward. Use whenever adding or changing code under server/src/modules, server/src/adapters or server/src/platform/container.ts — a new endpoint, route handler, service method, repository query, module, adapter, port or Container getter — even if the request only says "add an endpoint" or "call GitHub/git/the LLM from …". Never call an adapter or the DB from a route handler.
user-invocable: false
---

# Onion architecture — `server/`

Placement and dependency rules for the API. Why the wiring looks like this (boot order, DI container, ports table, layering exceptions): [server/docs/architecture.md](../../../server/docs/architecture.md). Fastify/Drizzle/zod mechanics: their own skills.

All paths below are relative to `server/src/`. `<m>` is a feature module folder under `modules/`.

## 1. Hard rules

1. **A route handler only translates HTTP.** It does zod `schema` → `getContext(container, req)` → **one** service call → return (or `reply.code`). Inside a handler the only `container` uses allowed are `getContext(container, req)`, `container.runBus` (SSE bridge only) and `container.config` (non-secret values).
2. **No adapter and no DB in `routes.ts`.** That means no `container.db`, `git`, `github()`, `githubWithToken`, `llm()`, `llmWithKey`, `secrets`, `codeIndex`, `embedder()`, `repoIntel`, `jobs`, `depgraph`, `tokenizer`, `agentsRepo`, `reviewRepo`, `priceBook` or `invalidateSecretCaches`, and no import of `drizzle-orm`, `db/*`, `adapters/*` or any `repository.ts`. When a route "just needs GitHub", the call goes in the service.
3. **SQL lives only in repositories.** Only `<m>/repository.ts` (and `reviews/repository/*.repo.ts`) import `drizzle-orm`, `db/schema` or `db/client`. Services get data through repository methods. They may use row *types* from `db/rows.ts`.
4. **Concrete adapters are created only in `platform/container.ts`.** Services type against port interfaces (`@devdigest/shared` or a server-local port) and receive the adapter. They never `new OctokitGitHubClient(…)` or import an adapter class.
5. **Dependencies point inward.** `adapters/*` may import ports, `platform/*` utilities and a module's `constants.ts`. They never import a service, a repository or a route. A module never imports another module's `service.ts`, `repository.ts` or `routes.ts`. Shared repositories come through Container getters (`agentsRepo`, `reviewRepo`, `repoIntel`). Another module's `constants.ts` / `types.ts` is fine.
6. **Ports are shaped by the core, not the vendor.** No octokit, simple-git, openai, Anthropic SDK or Drizzle types in a port signature. DTOs come from `@devdigest/shared`.
7. **Routes return contracts, not rows.** Map rows to `@devdigest/shared` DTOs in `<m>/helpers.ts` (`repos/helpers.ts` `toRepoDto`). Never send a Drizzle row as-is.
8. **New services take a narrow `deps` object, not the whole `Container`.** Passing the container in is a Service Locator: it hides what the service really uses. Existing services that take `Container` stay as they are (see Known deviations).

## 2. Layers

| Onion ring | Files | Holds | May import |
|---|---|---|---|
| **Domain** (core) | `vendor/shared` (zod contracts + ports in `adapters.ts`), server-local ports (`modules/repo-intel/types.ts`), `<m>/helpers.ts`, `<m>/constants.ts`, `platform/errors.ts`, `@devdigest/reviewer-core` | types, rules, pure transforms | other domain files only — no I/O, no `container`, no `db/*` |
| **Application** | `<m>/service.ts`, `reviews/run-executor.ts`, `repo-intel/pipeline/*`, job handlers | use cases: orchestrate repositories + ports, throw `AppError`s | domain, own `repository.ts`, `db/rows.ts` (types), `platform/*` (jobs, run-logger, resilience, contained-read), allow-listed pure adapter functions (section 5) |
| **Infrastructure — driven** | `<m>/repository.ts`, `db/*`, `adapters/*` | Drizzle queries; git/GitHub/ripgrep/LLM/embedder/secrets clients | domain (ports, DTOs), vendor SDKs, `platform/*` utilities |
| **Infrastructure — driving** | `<m>/routes.ts`, `modules/_shared/*` | Fastify plugins: validation, tenancy, status codes, SSE | own `service.ts`, `_shared/*`, `@devdigest/shared`, `platform/errors.ts`, own `helpers.ts`/`constants.ts` |
| **Composition root** | `platform/container.ts`, `app.ts`, `modules/index.ts`, the setup part of each route plugin | builds concrete adapters and services | everything |

The *setup part* of a route plugin is the code before the first `app.get/post/…`. It runs once at registration and may read Container getters to wire a service (rule 8). Handler bodies may not.

## 3. Recipes

### New endpoint

1. Contract: request/response zod schemas in `vendor/shared/contracts/*` (mirror into `client/src/vendor/shared`, per root `CLAUDE.md`).
2. Repository method for each new query in `<m>/repository.ts`.
3. Service method that does the use case: loads via the repository, calls ports, throws `NotFoundError` / `ValidationError` / … from `platform/errors.ts`.
4. Handler: `schema`, `getContext`, one service call, map to the DTO if the service doesn't already.
5. Test: `server/test/<m>[-<topic>].test.ts` through `buildApp({ overrides })` + `app.inject()`, or `*.it.test.ts` when it needs Postgres.

### New external integration (a new git op, GitHub call, index, LLM feature, secret)

1. **Port**: an interface shaped by what the service needs. Put it in `vendor/shared/adapters.ts` if `reviewer-core` or the client must see it. Otherwise make it server-local, next to its consumer (`modules/<m>/types.ts`). Extending an existing port (`GitClient`, `GitHubClient`, `CodeIndex`, `LLMProvider`, `SecretsProvider`) is preferred over a new one.
2. **Adapter**: `adapters/<kebab>/<impl>.ts` implements the port. Secrets come in through the constructor/callback from the container (`getToken: () => this.secrets.get(…)`), never from `process.env`. Retries go through `platform/resilience.ts`.
3. **Container**: a private field and a getter that is **override-first** (`if (this.overrides.x) return …`), lazy and cached (`??=`). A missing secret throws `ConfigError` **at use time**, not at boot. Add the field to `ContainerOverrides`. If it depends on a secret, clear it in `invalidateSecretCaches()`.
4. **Mock**: add a class to `adapters/mocks.ts`. Tests inject it through `buildApp({ overrides })`.
5. **Use**: the service receives the port via `deps` (or `this.container.<getter>` in a legacy service). The route still only calls the service.

### New service with narrow deps (rule 8)

```ts
// modules/<m>/service.ts
export interface PrDetailDeps {
  repo: PullsRepository;
  github: () => Promise<GitHubClient>; // lazy: throws ConfigError only when used
}
export class PrDetailService {
  constructor(private readonly deps: PrDetailDeps) {}
}

// modules/<m>/routes.ts — plugin setup, before any app.get
const service = new PrDetailService({
  repo: new PullsRepository(container.db),
  github: () => container.github(),
});
```

More wrong → right pairs from this repo: [references/examples.md](references/examples.md).

## 4. Gotchas

- **Pass `github` / `llm` / `embedder` lazily** (`() => container.github()`). They are async, they throw `ConfigError` when the key is missing, and wiring runs at boot when no keys may exist yet. Resolving them in plugin setup breaks boot without keys.
- **No I/O in plugin setup** beyond registering job handlers (`registerCloneJobHandler`, `registerIndexJobHandlers`). It runs once per app and under every test.
- **Call `getContext` in every handler**, even when the service ignores `workspaceId`. It is the only workspace-scoping guard (`modules/_shared/context.ts`).
- **Don't `try/catch` in a handler to pick a status.** Throw an `AppError` subclass from the service; `app.ts` maps it to the error envelope (`server/specs/api-error-envelope.md`). The one exception is a deliberate degraded reply, which you must comment.
- **Don't add ports for everything.** A port is for an external system or a swappable side effect. A pure transform is a domain function, and a repository needs no interface (the concrete Drizzle class is the accepted compromise, as long as nothing Drizzle-shaped leaves it).
- **Don't create pass-through layers.** A thin service method that only forwards to the repository is fine. A second service wrapping the first is not.
- `platform/{grounding,structured,prompt}.ts` re-export `reviewer-core`. Domain logic for reviews changes in `reviewer-core/src`.

## 5. Pure adapter functions (allow-list)

The rule is "no `adapters/*` imports from modules". These I/O-free exports are the only exceptions:

| File | Allowed exports |
|---|---|
| `adapters/git/diff-parser.ts` | `parseUnifiedDiff` |
| `adapters/codeindex/extract.ts` | `extractSymbols`, `extractReferences`, `extractEndpoints`, `extractCrons` |
| `adapters/astgrep/index.ts` | `langForFile`, `parseSymbols`, `parseReferences`, `parseImports`, `parseInvocationHeads` — **not** `parseChangedFiles` (reads files) |

A new pure helper belongs in the domain (`<m>/helpers.ts`, or `platform/` if it is cross-module), not in `adapters/`. Extend this list only with an I/O-free function, and say why in the change.

## 6. Known deviations

Existing code that breaks these rules is listed in [references/known-deviations.md](references/known-deviations.md). Don't copy it, and don't add to it. When a task already edits one of those handlers or files, move the offending call into the service/repository first (boy-scout rule), then make the change. A bulk cleanup is a separate task.

## 7. Checklist before finishing

Run from `server/`. Every hit must already be listed in `references/known-deviations.md`. A new hit is a violation you introduced.

```bash
# adapter / DB access inside routes
grep -nE "container\.(db|git|github|githubWithToken|llm|llmWithKey|secrets|codeIndex|embedder|repoIntel|jobs|depgraph|tokenizer|agentsRepo|reviewRepo|priceBook|invalidateSecretCaches)\b" src/modules/*/routes.ts
# Drizzle / schema outside repositories
grep -rnE "from 'drizzle-orm'|db/(schema|client)\.js'" src/modules --include=*.ts | grep -vE "repository(\.ts|/)"
# adapter imports from modules (only the section 5 allow-list)
grep -rnE "from '(\.\./)+adapters/" src/modules
# cross-module imports (only constants/types)
grep -rnE "from '\.\./[a-z-]+/" src/modules --include=*.ts | grep -v "'\.\./_shared/" | grep -vE "/(constants|types)\.js'"
```

- [ ] Each new handler: `schema` + `getContext` + one service call. No forbidden `container.*`.
- [ ] New queries are in `repository.ts`. New external calls go through a port and a Container getter (override-first, lazy) and have a mock in `adapters/mocks.ts`.
- [ ] New services take `deps`, not `Container`.
- [ ] Contract changes are mirrored into `client/src/vendor/shared`.
- [ ] `pnpm typecheck` and `pnpm exec vitest run --exclude '**/*.it.test.ts'` pass in `server/`.
