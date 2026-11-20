# `@devdigest/web` — the studio (Next.js 15)

The DevDigest UI: import repos, browse pull requests, run and read AI reviews,
and author agents. App Router + React Server/Client components, data via
**TanStack Query** hooks over the Fastify API. (This is the starter surface;
later milestones add the Skills, Memory, Eval, Blast/Brief, multi-agent, CI, and
dashboard screens.)

- **API base:** `NEXT_PUBLIC_API_BASE` ([api-client spec](specs/api-client.md#base-url)).
- **Run:** `pnpm dev`. **Test:** `pnpm test`. **Typecheck:** `pnpm typecheck`.

## Further reading

- Routes, the endpoints each page calls, and page states: [`specs/pages.md`](specs/pages.md)
- Server/Client boundaries, providers, data flow, live runs: [`docs/ui-architecture.md`](docs/ui-architecture.md)
- Tests: [`../TESTING.md`](../TESTING.md)
