# Onion / Hexagonal / Clean layering rules for TypeScript Node.js HTTP backends

Note: researched via WebFetch summaries (small-model extraction), so quotes are as returned by the tool; not independently verified verbatim. Only URLs listed under "URLs read" were read. Palermo parts 2-4, Vernon, Fowler bliki beyond the two pages, and the second half of Sairyss/nodebestpractices were NOT read.

## 1. How do the canonical sources define layers and dependency direction (mapping)?

### Takeaway
All three agree: dependencies point only inward toward the domain model; infrastructure, UI and tests sit outermost. They differ only in the number of rings (Onion: model / interfaces / services / edge; Clean: entities / use cases / interface adapters / frameworks; Hexagonal: inside vs. ports+adapters).

### Cited Findings
- Onion (Palermo, 29 Jul 2008): Domain Model at center "depends only on itself"; "all coupling is toward the center"; dependencies point inward only. — [Palermo part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- Onion: repository interfaces sit in the first layer around the domain model; "Only the interface is in the application core." UI, Infrastructure and Tests are on the outer edge; "The database is not the center. It is external." — [Palermo part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- Onion relies on Dependency Inversion: core depends on abstractions, implementations injected at runtime; Palermo says it is similar to Hexagonal ("Externalize infrastructure and write adapter code...") and "not appropriate for small websites." — [Palermo part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- Clean (Martin, 13 Aug 2012) Dependency Rule: "source code dependencies can only point inwards"; "Nothing in an inner circle can know anything at all about something in an outer circle"; inner circles must not name functions/classes/variables declared outside, nor use outer data formats (esp. framework-generated). — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Clean layers: Entities (enterprise rules); Use Cases (application rules, orchestrate entities); Interface Adapters (controllers, presenters, gateways-like converters); Frameworks & Drivers (DB, web framework, "glue"). Four circles are schematic; more allowed if the rule holds. — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Clean: data crossing boundaries = simple isolated structures/DTOs; do not pass entities or DB rows (a row struct would make the inner circle know the outer); data crosses "in the form that is most convenient for the inner circle." — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Clean: control flow goes controller -> use case -> presenter, but source dependencies oppose it via DIP (use case calls an "output port" interface implemented by an outer presenter). — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Hexagonal (Cockburn, 2005-09-04): app logic inside; every external interaction through a port (interface for one purpose); adapter converts between port API and a technology; one port can have many adapters (GUI, test harness, mock DB). "The rule to obey is that code pertaining to the inside part should not leak into the outside part." — [Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- Explicit Architecture (Graça, 2017-11-16, upd. 2020-03-20) mapping: Domain Model at centre; Domain Services in Domain Layer; Application Layer = use cases/application services/command handlers + ports (ORM, search, messaging); outside = UI, tools, infrastructure adapters. Domain services "know nothing about" application-layer classes. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Application services "contain the logic to unfold a use case": load entities via repositories, call domain logic, persist. Domain services hold logic spanning several entities. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Fowler (26 Aug 2015): three-layer presentation/domain/data; main benefit is reduced scope of attention; adding a mapper so domain does not depend on data source "is often called Hexagonal Architecture"; he rarely hears of data-source substitution actually happening; extra layers (service layer) don't break the pattern. — [Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- Sairyss: "Outer layers can depend on inner layers, but inner layers never depend on outer layers"; core "shouldn't depend on frameworks or access external resources directly." — [Sairyss DDH](https://github.com/Sairyss/domain-driven-hexagon)

### Inferences
- Mapping for the target codebase: routes.ts = driving adapter (interface adapters); service.ts = application service/use case; domain types + pure rules = domain; repository.ts and git/octokit/ripgrep/LLM/secrets = driven adapters (frameworks & drivers); DI container = composition root (outermost).

### Gaps
- Palermo parts 2-4 (service-layer and "interfaces in the core" details, 2008) not read.
- Vernon (Implementing DDD) not accessed.

## 2. Who owns port interfaces? Driving vs. driven ports

### Takeaway
Sources converge: ports belong to the inside (application core), shaped by core needs, with adapters depending on them. A neutral shared package is a pragmatic variant, but then it should contain only the core's ports/contracts and not adapter-shaped types.

### Cited Findings
- "the Ports (Interfaces) belong inside the business logic, while the adapters belong outside"; ports should fit the core's needs, not mimic tool APIs. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Sairyss: "Ports should be created to fit the Domain needs, not simply mimic the tools APIs"; ports may sit in the Domain layer when domain logic itself needs an external resource; warns "abusing ports/interfaces may lead to unnecessary abstractions" and that abstracting the DB is "not always useful." File naming `.repository.port.ts`; shared building blocks in `src/libs/ports/`. — [Sairyss DDH](https://github.com/Sairyss/domain-driven-hexagon)
- Cockburn does not state ownership explicitly; the port protocol "is given by the purpose of the conversation" and use cases are written against the inner boundary (so implicitly the application side owns it). — [Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- Driving (primary): actors that start the conversation (users, test harnesses, batch); driven (secondary): actors the application calls (DB, notifications); mocks are natural for driven side. — [Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- Primary adapters translate a delivery mechanism into a method call on the core; secondary adapters "implement a Port... and are then injected into the Application Core." — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Graça's Shared Kernel: keep it "as minimal as possible because any changes ... will affect all components." — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Clean: outputs use a use-case-owned output port implemented by the outer layer (ownership by inner circle). — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

### Inferences
- Port interfaces in a shared contracts package are acceptable for the dependency rule as long as the package depends on nothing outer (no octokit/drizzle types) and port signatures use domain-shaped types. Risk: the package becomes a dumping ground (Shared Kernel warning). Rule of thumb: ports serving one module live with that module's core; only genuinely cross-module ports/contracts go in shared.
- Driving ports are largely implicit in Node (service class public methods); explicit interfaces are mostly needed on driven side.

### Gaps
- No source found giving an explicit rule on "shared package vs. per-module" for TS monorepos.

## 3. Thin controller rule; why forbid direct infra/DB calls in controllers; exceptions

### Takeaway
Controllers are driving adapters: translate HTTP into a call to the application layer and back; no business rules, no direct adapter/DB access. Accepted deviations: query side (CQRS read models) and trivially simple CRUD, both flagged as conscious trade-offs.

### Cited Findings
- Controllers are driving adapters; without a bus they depend on an Application Service or Query object; with a bus they build a command/query and dispatch. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Clean: controllers/presenters are in Interface Adapters and talk to Use Cases; flow begins in controller, runs through use case. — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Node best practices 1.2: layer components (entry-point folder for controllers/consumers, domain folder, data-access folder); goal "separate the technical concerns (e.g., HTTP, DB, etc) from the pure logic of the app"; don't pass req/res to domain functions - hurts reuse from tests, scheduled jobs, message queues. — [nodebestpractices](https://github.com/goldbergyoni/nodebestpractices)
- Sairyss: one controller per use case/trigger type; core/domain "shouldn't throw HTTP exceptions or statuses"; application services contain no domain business logic. — [Sairyss DDH](https://github.com/Sairyss/domain-driven-hexagon)
- Stemmler (upd. 2019-09-16): controllers sit in the adapter layer and accept requests; use cases define app features; domain rules kept near entities, cross-entity rules in domain services so they aren't lost in one use case; "For trivially small applications, this might seem like overkill"; worthwhile "when your application has a lot of business rules." — [Stemmler](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/)
- Recognised reasons (from sources above): (a) outward-pointing dependency makes the inner layer know HTTP/DB details (Dependency Rule); (b) reusability from other drivers - tests, jobs, queues (Cockburn, nodebestpractices); (c) testability with mocks at driven ports (Cockburn); (d) business rules scattered in delivery code get lost/duplicated across use cases (Stemmler); (e) reduced scope of attention (Fowler).
- CQRS exception: "In read model we can bypass a domain and repository layers completely and query database directly from a query handler." — [Sairyss DDH](https://github.com/Sairyss/domain-driven-hexagon)
- Graça: Query object "will contain an optimized query that will simply return some raw data" as a DTO for the view. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Fowler on CQRS (14 Jul 2011): default to CRUD for many systems; apply CQRS only to specific bounded contexts; most cases he saw "went poorly"; alternative is a ReportingDatabase. — [Fowler CQRS](https://martinfowler.com/bliki/CQRS.html)

### Inferences
- Defensible exception: a read-only route that calls a query function/read-model (still behind a service or an explicit "queries" port) - not a controller calling octokit/git/LLM or writing via Drizzle. Even for reads, the exception sources describe a distinct query handler, not SQL inline in the HTTP handler.
- Controller rule checklist: parse/validate (zod) -> call one service method with plain args (not req/res) -> map result/domain errors to status codes. Everything else (orchestration, adapter calls, transactions) is service-level.

### Gaps
- No source gave a formal definition of "thin controller" size limits; "simple CRUD" exception criteria are only implied (Stemmler, Fowler), not specified.

## 4. Where does the repository sit; may application services call a Drizzle repository class directly?

### Takeaway
By canonical sources the repository interface belongs to the core and its implementation is an outer (driven) adapter. Pragmatic practitioners accept variants, but a service importing a concrete ORM-bound class couples the core to infrastructure and is the thing the Dependency Rule forbids; the cost/benefit is a judgement call.

### Cited Findings
- Palermo: repository interface in the core ring; implementing DB code at the edge. — [Palermo part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- Graça: "The repository interface is an abstraction on the persistence engine itself"; author's own comment allows either repository interfaces as ports with implementations in infrastructure, or a persistence port in front of an ORM adapter with repository implementations in the core. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- Sairyss: "Application's core usually is not allowed to depend on repositories directly" (use port abstractions), but abstracting the DB is "not always useful"; repository port file convention `.repository.port.ts`. — [Sairyss DDH](https://github.com/Sairyss/domain-driven-hexagon)
- Clean: DB row structures must not cross into inner circles. — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Fowler: substitution of the data source is rarely realised; the benefit of layering is mainly attention/testing seams. — [Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)

### Inferences
- Pragmatic ladder for service -> repository: (1) strict: service depends on a `XRepository` interface; DI injects Drizzle impl; (2) compromise: repository class is the only module importing drizzle, services import it but never drizzle/schema types, and repository returns domain-shaped types (not raw rows); tests use a real Postgres. (2) violates the letter of Onion but preserves most benefit; document it as a conscious exception. Drizzle row types leaking into services is the main concrete failure to ban.

### Gaps
- No source specifically on Drizzle or TS-class repositories; no primary source blessing option (2).

## 5. May inner layers import pure, I/O-free utilities that physically live in an adapter folder?

### Takeaway
Sources define the rule by dependency on I/O/frameworks, not by folder; pure, I/O-free code is compatible with the inner layers, but importing it from an adapter folder still creates a source-level inward->outward dependency, so the usual advice is to relocate pure logic into the core (or a neutral lib) and let the adapter import it.

### Cited Findings
- Clean: inner circles must not "name anything declared in outer circles" - rule is about declarations in outer circles (source location), regardless of purity. — [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Sairyss: core libraries should not expose out-of-process access, technology details (ORMs, loggers) or randomness; single-purpose libs acceptable if isolated; general-purpose libs discouraged in domain. — [Sairyss DDH](https://github.com/Sairyss/domain-driven-hexagon)
- Functional core / imperative shell (Bernhardt, 2012) is presented as the same principle as Ports & Adapters at a lower level; pure functions with no ports or I/O fit the core, I/O belongs in the shell. This is from a search-result summary only, not a fetched primary page. — [search result: Functional Core with Ports and Adapters (DEV)](https://dev.to/siy/functional-core-with-ports-and-adapters-3m0g)
- Graça: Shared Kernel may hold shared functionality; keep minimal. — [Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)

### Inferences
- Judgement rule: a parser/diff-parser/AST extractor that takes strings and returns domain data is domain-eligible; test by "does the module import fs/child_process/octokit/drizzle/network?" If no, move it to `domain/` (or `lib/`) and have the adapter import it. If relocation is too costly, an allow-listed import of a verified-pure module is a pragmatic exception, enforced by a lint/depcruise rule scoped to that file (not folder-wide).
- Caveat: a parser whose output shape mirrors a specific tool's format (e.g., ripgrep JSON) is an adapter concern even if pure - translation into domain types is the adapter's job (Clean "Interface Adapters").

### Gaps
- No primary source explicitly addressing "pure function physically in adapter folder"; conclusions here are inference.

## 6. Pragmatic application in TypeScript/Node

### Takeaway
Practitioners favour module-per-business-capability with internal layering, explicit ports only where they pay off, enforcement by tooling, and skepticism toward over-abstraction.

### Cited Findings
- Node best practices: structure by business components, each owning API, logic and data; layer each with entry-point / domain / data-access folders. — [nodebestpractices](https://github.com/goldbergyoni/nodebestpractices)
- Sairyss folder layout: `src/modules/<module>/{domain, database, commands/<use-case>, queries/<use-case>}`, shared blocks in `src/libs/`; role suffixes (`.entity.ts`, `.service.ts`, `.query-handler.ts`, `.http.controller.ts`, `.repository.port.ts`); app services should not depend on other app services (cycles); avoid business logic in services - put in entities; domain services only operate on domain types. (Page truncated; "enforcing architecture" section not read.) — [Sairyss DDH](https://github.com/Sairyss/domain-driven-hexagon)
- Fowler: at larger granularity top-level modules should be domain-oriented and internally layered; layers are logical not physical. — [Fowler](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- Stemmler: ceremony pays off with many business rules; overkill for trivial apps. — [Stemmler](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/)
- Palermo: not appropriate for small websites. — [Palermo part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)

### Inferences
- Actionable rules for routes -> service -> repository + DI container: (1) routes import services only (and zod schemas), never adapters/drizzle; (2) services receive adapters via constructor/container typed by port interfaces; (3) ports shaped by core needs, no octokit/drizzle types in signatures; (4) only repository files import drizzle; (5) no req/reply in services; domain errors mapped to HTTP in routes/error handler; (6) cross-module service calls only via service interfaces, avoid cycles; (7) enforce via dependency-cruiser / eslint no-restricted-imports (tooling suggestion, not from a fetched source); (8) read-only query paths may use a query module as documented exception.

### Gaps
- Vernon's Implementing DDD and Stemmler's other articles (e.g., on repositories/DTOs) not read; no source on dependency-cruiser enforcement read.

## URLs read
- https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- https://alistair.cockburn.us/hexagonal-architecture/
- https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/
- https://github.com/Sairyss/domain-driven-hexagon (first 100k of 121k chars)
- https://martinfowler.com/bliki/PresentationDomainDataLayering.html
- https://martinfowler.com/bliki/CQRS.html
- https://github.com/goldbergyoni/nodebestpractices (first 100k of 153k chars)
- https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/
- Search-result only (not fetched): https://dev.to/siy/functional-core-with-ports-and-adapters-3m0g
