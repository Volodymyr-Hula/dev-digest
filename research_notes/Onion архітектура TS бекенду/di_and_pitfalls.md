# DI / Composition Root without frameworks in TS Node backends, and Onion/Hexagonal/Clean anti-patterns

Context: Fastify 5 app with hand-written `Container` (lazy cached getters, `overrides` for tests, `app.container`). Pages below were actually fetched (WebFetch summaries, not raw reads) unless marked "search snippet only". Today = 2026-11-23.

## 1. Composition root, Service Locator, and whether passing a whole container is a locator

### Takeaway
Seemann: concrete wiring belongs in one place near the entry point; the container must not be referenced elsewhere. Passing the whole container into services is the Service Locator shape (hidden dependencies); Fowler concedes locators are tolerable in closed application code. A pragmatic split: container only visible in the composition root and in thin route/plugin glue; services take narrow constructor deps.

### Cited Findings
- Definition: "A Composition Root is a (preferably) unique location in an application where modules are composed together." Should be "As close as possible to the application's entry point." (28 Jul 2011) — [Seemann, Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- "The earlier you compose, the more you limit your options, and there's simply no reason to do that." Container "should only be referenced from the Composition Root"; "All other modules should have no reference to the container." — [same](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- Service Locator hides a class's dependencies: missing registrations become run-time errors instead of compile-time; callers can't tell from the constructor what is needed; it's used as a "replacement for the new operator"; later he says it violates encapsulation (and SOLID, 2014 update). "Don't call the container, it'll call you." (3 Feb 2010, updated 2014/2015) — [Seemann, Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/)
- Distinction: same container used in the root to build the graph = fine; container called from inside business code = locator. — [same](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/)
- Fowler (23 Jan 2004): locator vs injection differ in whether the class asks or is given; every user of a locator depends on the locator; for application code they are "roughly equivalent" with locator having "a slight edge due to its more straightforward behavior"; injection is better for components reused in multiple applications; locator can be a simple data holder easy to populate with test stubs; "both are very amenable to stubbing". — [Fowler, IoC Containers and the DI Pattern](https://martinfowler.com/articles/injection.html)
- Awilix README itself says calling `container.resolve()`/`cradle` inside application code couples it to the container; Awilix should stay transparent to app code. — [awilix](https://github.com/jeffijoe/awilix)
- Herberto Graça: driven adapters are injected into the core; ports are "created to fit the Application Core needs and not simply mimic the tools APIs". Article does not detail a container/composition root. — [Explicit Architecture #01](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)

### Inferences
- A `Container` class with typed getters that is handed to a service (`new Svc(app.container)`; `container.reviewRepo` inside methods) is a Service Locator by Seemann's definition, even though not "magic": dependencies are invisible in the signature. Mitigation is cheap in TS: services declare `deps: { repo: ReviewRepo; llm: LlmPort }` and the Container's getter builds them (`new ReviewService({ repo: this.repo, llm: this.llm })`), so the Container is only referenced in the root.
- Pragmatic acceptance (Fowler's "closed application" argument): route handlers/plugins that read `app.container.xxx` to pull a *service* are transport glue, effectively part of the composition root's edge (analogous to Seemann's ASP.NET controller-factory case). Rule of thumb: routes may touch the container; services, domain and adapters may not. Lazy getters are a locator-like trait but harmless if only the root calls them.
- Fowler's point is weaker for a hand-rolled Container in a closed app; Seemann's argument (hidden deps, run-time failure) is mitigated in TS by typing, so the real cost is mostly readability and test setup (must construct whole container to test one service).

### Gaps
- No source found on a TS/Fastify-specific "is `app.container` a locator" verdict; the above is inference.
- Seemann pages were read via summarizing fetch; exact wording of 2014 SOLID update not verified.

## 2. Pure DI vs frameworks (Inversify, tsyringe, awilix, fastify-awilix) and Fastify patterns

### Takeaway
Pure DI (manual constructor injection in one composition root) is a first-class option with compile-time safety; containers pay off with conventions/lifetimes at scale. Fastify's own plugin/decorate model gives encapsulated, DAG-scoped sharing without a container; request-scoped state should be created in `onRequest`, never shared via reference decorators.

### Cited Findings
- "Pure DI is Dependency Injection without a DI Container"; containers are "optional helper libraries"; DI without a container is "in many cases, better". (10 Jun 2014, P.S. 2018) — [Seemann, Pure DI](https://blog.ploeh.dk/2014/06/10/pure-di/)
- "When to use a DI Container" (6 Nov 2012): container best value with Convention over Configuration; Explicit Register loses compile-time feedback ("you lose more advantages than you gain"); Pure DI easy to learn, graph visible without magic, errors at compile time; "Don't use a DI Container just to use one." 2015 comment: he now prefers "explicit lifetime matching I get from Pure DI". — [Seemann, When to use a DI Container](https://blog.ploeh.dk/2012/11/06/WhentouseaDIContainer/)
- Awilix: PROXY (default, cradle object) vs CLASSIC (parameter-name matching; breaks under minification); lifetimes TRANSIENT (default)/SCOPED/SINGLETON; per-request scope via `createScope()`; captive dependency warning (singleton holding stale scoped data), strict mode throws; `container.dispose()` on server close. — [awilix](https://github.com/jeffijoe/awilix)
- fastify-awilix (`@fastify/awilix`): `diContainer`, request-scoped `request.diScope` registered in an `onRequest` hook, `disposeOnClose`/`disposeOnResponse`, typing via `declare module '@fastify/awilix'` extending `Cradle`/`RequestCradle`. No dedicated testing section in README. — [fastify-awilix](https://github.com/fastify/fastify-awilix)
- Fastify `decorate`: attaches values to the server instance; arrow functions break `this`; `dependencies` array makes `decorate` throw at boot if a required decorator is missing; sync API, async setup via `register` + `fastify-plugin`; duplicate name in same context throws. — [Fastify Decorators](https://fastify.dev/docs/latest/Reference/Decorators/)
- `decorateRequest`/`decorateReply` with reference types: error, because "any mutation will impact all requests, potentially creating security vulnerabilities or memory leaks"; recommended: init to `null`/'' then assign in an `onRequest` hook (or getter/setter pair). — [same](https://fastify.dev/docs/latest/Reference/Decorators/)
- Plugin encapsulation: `register` creates a child scope; `decorate` changes visible to descendants, not ancestors; wrapping with `fastify-plugin` stops the new scope so decorations reach the parent (recommended); `fp` side effects: `prefix`/`logLevel`/`logSerializers` options ignored. — [Fastify Plugins](https://fastify.dev/docs/latest/Reference/Plugins/)
- TypeScript: type decorators by declaration merging `declare module 'fastify' { interface FastifyInstance { ... } }`; augmentation is global and "may lead to conflicts ... in multi-server setups or with plugin encapsulation"; `getDecorator<T>` is the scoped alternative; types not verified against runtime. — [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
- Sairyss: application services receive implementations from "the DI library"; frameworks "want to be in control", fine in outer layers, keep domain clean of them. — [domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)

### Inferences
- For a single-process app with a single composition root, `app.decorate('container', container)` (container is a singleton, not per-request) is consistent with Fastify docs: it is an instance-level decorator, not a request-level reference type. The reference-type restriction applies only to `decorateRequest/Reply`; don't put per-request mutable state on the container.
- Hand-written lazy-getter Container = Pure DI with memoization; it keeps compile-time safety (Seemann's main argument) and avoids reflection decorators (Inversify/tsyringe need `reflect-metadata`/experimental decorators; not verified in this research). Per-request scoping is the main feature you would be missing; if needed, create a small per-request object in `onRequest` rather than adopting awilix.
- Awilix PROXY mode's `cradle` injection is itself locator-shaped (dependencies hidden behind a bag), which Awilix's own docs acknowledge via the "keep it transparent" principle.
- Declaration-merging `app.container` is global typing; fine for single app, `getDecorator<T>` safer if multiple Fastify instances in tests with different shapes.

### Gaps
- Did not fetch InversifyJS or tsyringe docs; no cited comparison of them.
- No primary source on "Fastify + manual DI" recommended pattern beyond the decorate/plugin docs.

## 3. Testing seams: override-first containers, fakes vs mocks, contract tests

### Takeaway
Classical, state-based tests with fakes of driven ports are less coupled to implementation than mock expectations; fakes need contract tests (same suite against the fake and the real adapter) so they cannot drift. An `overrides` object on the container is a legitimate seam (Fowler: locators/containers are "very amenable to stubbing").

### Cited Findings
- Fowler definitions: Fake = working implementation with a shortcut unsuitable for production (e.g. in-memory DB); Stub = canned answers; Mock = pre-programmed expectations, behavior verification. Mockist tests are more coupled to implementation and can "interfere with refactoring"; mock expectations can be wrong and mask errors; Fowler remains a classicist. (2 Jan 2007; first published 8 Jul 2004) — [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)
- Fowler (2015): module boundaries give "seams that are good affordance for testing"; test doubles around the data layer make domain tests faster. — [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- Contract tests pattern: one shared test suite per port run against the in-memory fake and each real adapter; run in-memory contract in unit stage and real-DB contract in integration stage. Sources are small blogs/examples (search snippet only, pages not fetched): [Anhaia, DEV](https://dev.to/gabrielanhaia/contract-tests-in-php-proving-every-adapter-honors-its-port-3hmp), [Maltcommunity example](https://github.com/Maltcommunity/repository-test-example), [DZone](https://dzone.com/articles/testing-repository-adapters-with-hexagonal-architecture)
- Awilix: dispose container at test end to release pools in watch-mode integration tests. — [awilix](https://github.com/jeffijoe/awilix)

### Inferences
- Override-first container: `new Container({ overrides: { llm: fakeLlm } })`; getters should return `overrides.x ?? (this.#x ??= build())`. Override only driven ports (LLM, GitHub client, clock, repo-intel), never domain/services. Type `overrides` as `Partial<Ports>` so a typo fails at compile time.
- Prefer hand-written fakes (in-memory repo, scripted LLM) with a contract suite over `vi.fn()` mocks for ports with behavior; use mocks/spies only for "was it called" checks on fire-and-forget ports (notifications).
- Container should expose a `dispose()`/`close` wired to Fastify `onClose` (inference from awilix guidance).

### Gaps
- Contract-test sources are low-authority and non-TS; no canonical reference found.

## 4. Anti-pattern catalogue

### Takeaway
The recurring failures are (a) ceremony without behavior (anemic model, pass-through layers, interface per class, mapping everywhere) and (b) boundary violations (ORM types leaking, layer skipping, cross-module coupling). Authorities themselves say the full architecture is ill-suited to simple CRUD.

### Cited Findings
- Anemic Domain Model: objects with little behavior, logic in services; "incur all of the costs of a domain model, without yielding any of the benefits"; effectively Transaction Scripts; "If all your logic is in services, you've robbed yourself blind." Service layer should be thin coordination. (25 Nov 2003) — [Fowler](https://martinfowler.com/bliki/AnemicDomainModel.html)
- Sairyss: business logic in services "leads to Anemic Domain Model"; application services "should not depend on other application services" (cyclic dependencies); command handlers shouldn't call other commands (use events). — [domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)
- Over-abstraction: "abusing ports/interfaces may lead to unnecessary abstractions and overcomplicate your application"; "In a lot of cases it's totally fine to depend on a concrete implementation instead of abstracting it with an interface"; repository abstraction "not always useful"; full architecture "generally ill-suited to simple CRUD applications"; "everything below is a recommendation, not a rule". — [same](https://github.com/Sairyss/domain-driven-hexagon)
- Leaking persistence: one model for domain and DB "leads to a database-centric architecture"; "Domain layer should not know anything about persistence models"; otherwise "any change to the database will lead to change in your domain Entities"; separation may be overkill for smaller apps. (README read only up to char 100000 of 121016.) — [same](https://github.com/Sairyss/domain-driven-hexagon)
- Cross-component coupling: components must not reference each other directly even via interfaces; use events, shared kernel, or discovery; keep shared kernel minimal; domain logic must not leak into application layer; the author sometimes bypasses layers (UI -> infrastructure) by team agreement, guarded with tests. Architecture depends on timeframe, lifespan, team experience. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Layer count/granularity: layering "should only be applied at a relatively small granularity"; when a layer gets too big, "split your top level into domain oriented modules" (internally layered); doesn't object to extra layers per se; he "rarely hear[s] of someone actually doing" data-layer substitution. (26 Aug 2015) — [Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- Practitioner critique: simple form-save grew to "at least 20 different classes and interfaces"; pass-through layers "existing only to satisfy an architectural rule on a diagram"; "three classes and two layers of mapping" for simple CRUD; "guidelines, not dogmas". (Posted 20 Sep 2025 on author's blog; DEV repost) — [Lenzo, The Clean Architecture Trap](https://dev.to/marcolenzo/the-clean-architecture-trap-241k)
- When Clean Architecture pays off: complex business rules, long lifespan, multiple teams, hard testability needs. Overkill: simple CRUD, prototypes/MVPs, small focused services, internal tools; mixed signals -> start single project, migrate later. (dated 11 Aug 2026; .NET-oriented) — [Jovanovic](https://milanjovanovic.tech/blog/when-to-use-clean-architecture)
- Search-level corroboration only (not fetched): Microsoft Tech Community thread concluding full Clean Architecture is usually overkill for small teams; generic repository critique. — [thread](https://techcommunity.microsoft.com/discussions/app-dev/is-clean-architecture-overkill-for-small-teams-maintaining-a-single-web-app-/4441078)

### Inferences
- Catalogue to include in rules doc: anemic services (check: do entities/pure functions own invariants?); interface-per-class with one impl and no test-double need; ports that mimic vendor SDK instead of domain need; Drizzle row/`InferSelectModel` types exported through services or HTTP contracts (use zod contract types + explicit mappers at the adapter boundary); fat routes (parsing + SQL + orchestration in handler); layer skipping (route -> db) without explicit exception; service-to-service and module-to-module imports of internals (expose a module's public surface only); pass-through layers; premature generalization (generic repository, base classes); container passed into services.
- For a CRUD-heavy module in this project, rule should be "ports only where there is a real second implementation or a test seam (LLM, GitHub, clock, index); plain repository functions/Drizzle calls in a thin service otherwise". Evidence is practitioner opinion, not empirical.
- Dan North / Kent C. Dodds sources suggested in the brief were not found/fetched; no coverage.

### Gaps
- No empirical data on cost/benefit of ports-for-everything; all sources are opinion.
- Drizzle-specific leakage guidance not found (generalized from persistence-model guidance).
- Did not read Stemmler.

## 5. Incremental migration of fat-route modules

### Takeaway
Use the strangler idea at module scale: find seams, move behavior piece by piece, deliver continuously; combine with small boy-scout refactors on touched code rather than big-bang rewrites.

### Cited Findings
- Strangler Fig: don't do a risky one-shot rewrite; build new pieces alongside, "move bits of behavior from the legacy system into the new code base"; steps: define outcomes, find seams, deliver in a steady stream, adapt the organization; "doesn't make modernization easy", makes investment/returns gradual. (22 Aug 2024) — [Fowler](https://martinfowler.com/bliki/StranglerFigApplication.html)
- Boy Scout Rule: "Always leave the campground cleaner than you found it" (Robert C. Martin, 97 Things chapter); commentary says keep it small, otherwise it is a task, not a boy-scout fix (secondary sources). — [O'Reilly 97 Things](https://www.oreilly.com/library/view/97-things-every/9780596809515/ch08.html) (search result only; page not fetched; other blogs are secondary)
- Graça: team-agreed layer bypass guarded by tests is acceptable. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Jovanovic: for mixed signals start simple and migrate later. — [Jovanovic](https://milanjovanovic.tech/blog/when-to-use-clean-architecture)

### Inferences
- Concrete recipe (inference): (1) write/keep a route-level test via `app.inject` with container overrides as the characterization net; (2) extract handler body into `service.method(deps)` verbatim, route becomes parse -> call -> map; (3) replace direct `db` use in the service with a repository function/port only when touched; (4) never mix extraction with behavior change in the same commit; (5) freeze rule: new routes must follow the new shape, old ones migrate when edited; (6) list legacy modules as explicit exceptions in the rules doc so the exception is visible (cf. Graça's team-agreed bypass).

### Gaps
- No TS/Fastify-specific migration case study found.
