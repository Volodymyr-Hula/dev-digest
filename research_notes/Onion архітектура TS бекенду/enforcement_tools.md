# Mechanical enforcement of layer/dependency rules in TypeScript codebases

URLs actually read: 
- https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/rules-reference.md
- https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/cli.md
- https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/options-reference.md
- https://github.com/sverweij/dependency-cruiser/releases
- https://eslint.org/docs/latest/use/suppressions
- https://eslint.org/docs/latest/rules/no-restricted-syntax
- https://eslint.org/docs/latest/rules/no-restricted-imports
- https://raw.githubusercontent.com/javierbrea/eslint-plugin-boundaries/master/README.md
- https://www.jsboundaries.dev/docs/quick-start/
- https://www.jsboundaries.dev/docs/guides/typescript-support/
- https://raw.githubusercontent.com/LukasNiessen/ArchUnitTS/main/README.md
- https://raw.githubusercontent.com/ts-arch/ts-arch/master/README.md
- npm registry via `npm view` (run locally 2026-11-23): dependency-cruiser, eslint-plugin-boundaries, archunit, tsarch, eslint
- https://registry.npmjs.org/dependency-cruiser, /eslint-plugin-boundaries, /archunit, /tsarch (truncated; only dist-tags usable)
- Failed (HTTP 503): https://github.com/sverweij/dependency-cruiser/blob/main/doc/faq.md

## 1. dependency-cruiser: forbidden rules, CI, baseline, tsconfig/ESM

### Takeaway
dependency-cruiser is the strongest fit for file-level import rules (regex path matching with `$1` group capture, built-in baseline/known-violations, tsconfig paths). Current version is 18.9.0 (not 17), so "v17" docs apply with minor drift. It sees only imports, never calls or member accesses.

### Cited Findings
- Latest npm version is 18.9.0, published 2026-11-22; recent cadence: 18.7.1 (11-01), 18.7.2 (11-02), 18.8.0 (11-16), 18.9.0 (11-22) — `npm view dependency-cruiser time` (npm registry); [GitHub releases](https://github.com/sverweij/dependency-cruiser/releases) shows v18.9.0 22 Nov as latest stable. Very actively maintained.
- A rule needs `from` and `to`; `forbidden` rules also take `name`, `severity` (`error|warn|info|ignore`, default `warn`), `comment` — [rules-reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/rules-reference.md)
- `path`/`pathNot` are regular expressions, not globs (`src/**/*` -> `^src`); each accepts an array. In `from` it is the importing file; in `to` the resolved target — [rules-reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/rules-reference.md)
- Group matching: capture in `from.path` with parentheses, reference as `$1`.. in `to.path`/`to.pathNot`. Official example forbidding cross-component imports while allowing intra-component:
```json
{ "name": "no-inter-ubc", "severity": "error",
  "from": { "path": "^src/business-components/([^/]+)/.+" },
  "to":   { "path": "^src/business-components/([^/]+)/.+",
            "pathNot": "^src/business-components/$1/.+" } }
```
  — [rules-reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/rules-reference.md)
- `to.dependencyTypes` / `dependencyTypesNot` (e.g. `npm`, `npm-dev`, `core`, `local`, `type-only`) match how a dependency was declared — same source.
- `allowed` whitelist mode exists: anything matching no allowed rule yields `not-in-allowed` (default severity warn; `allowedSeverity` changes it) — same source.
- CLI: config auto-picked from `.dependency-cruiser.js` (since v13); `--config` only for alternative file; `--init` generates a config; `-T err-long` reporter; the `err` reporter exits with number of error-severity violations (CI gate) — [cli.md](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/cli.md)
- Baseline: current method is `dependency-cruiser src --baseline` (creates/updates `.dependency-cruiser-known-violations.json`; `--baseline-mode full|shrink-only|format`); `depcruise-baseline` is deprecated alias. Run with `--ignore-known` to downgrade known violations to `ignore`; `--no-ignore-known` shows them again — [cli.md](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/cli.md)
- `--cache` (since 11.14.0) stores in `node_modules/.cache/dependency-cruiser`; strategy `metadata` (git) or `content`; `--baseline` implies `--no-cache` — [cli.md](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/cli.md), [options-reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/options-reference.md)
- `options.tsConfig: { fileName: "tsconfig.json" }` makes it use `compilerOptions` (incl. `paths`), follows `extends`. `tsPreCompilationDeps: true` includes type-only imports (also faster); `"specify"` lets rules distinguish them but is slower. Note the default EXCLUDES imports that vanish on compile (type-only) — so `import type { X } from '../adapters/..'` is invisible unless this is set to `true` — [options-reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/options-reference.md)
- `exclude`, `includeOnly`, `doNotFollow`, `baseDir` options exist — same source.

### Concrete config (assembled for the target rules; my construction from the documented syntax, not copied from a doc)
```js
// .dependency-cruiser.cjs  (server/)
module.exports = {
  forbidden: [
    { name: "routes-no-adapters-or-schema", severity: "error",
      from: { path: "^src/modules/[^/]+/routes\\.ts$" },
      to:   { path: ["^src/adapters/", "^src/db/schema"] } },
    { name: "service-no-adapters", severity: "error",
      from: { path: "^src/modules/[^/]+/service\\.ts$", pathNot: "^src/modules/(pure-a|pure-b)/service\\.ts$" },
      to:   { path: "^src/adapters/" } },
    { name: "modules-isolated", severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to:   { path: "^src/modules/([^/]+)/", pathNot: "^src/modules/$1/" } },
    { name: "only-container-imports-adapters", severity: "error",
      from: { path: "^src/", pathNot: ["^src/platform/container\\.ts$", "^src/adapters/"] },
      to:   { path: "^src/adapters/" } }
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    includeOnly: "^src/",
    doNotFollow: { path: "node_modules" },
    cache: true
  }
};
// CI: npx depcruise src --config --ignore-known   (baseline: npx depcruise src --baseline)
```
Caveat on "concrete adapter classes only in container": the rule above bans importing any adapter file; adapter *interfaces* would have to live outside `src/adapters/` (or be allowed via pathNot) — design assumption.

### Inferences
- Because `src/vendor/shared` and tsconfig `paths` aliases are used (per repo CLAUDE.md), `tsConfig` must be set or aliased imports won't resolve into `src/...` paths and rules silently miss.
- `tsPreCompilationDeps: true` is needed if type-only imports from adapters/schema must also be banned.
- Regex `from.path` + `$1` directly expresses "modules must not import each other"; this is the main advantage over glob-based tools.

### Gaps
- ESM `.js`-suffix imports (`import './x.js'` resolving to `x.ts`): the options-reference page I read does not mention `extensionAlias`; the FAQ fetch returned 503. I could not confirm how v18 resolves this (it may be handled automatically via TypeScript resolution when `tsConfig` is set, but this is unverified). Must be tested empirically in the repo.
- Exact v17 -> v18 breaking changes not found.
- The docs read are `main` branch (v18); the doc itself had internal inconsistencies about where `numberOfDependents*` may be used (not needed for our rules).

## 2. ESLint: no-restricted-imports, no-restricted-syntax, eslint-plugin-boundaries

### Takeaway
`no-restricted-syntax` with esquery selectors is the only tool in this set that is both mainstream and can ban `container.db` / `container.github()` member/call expressions in specific files (via per-`files` flat config blocks). eslint-plugin-boundaries (v7.4.4) is declarative for import layers but is heavier to configure than dependency-cruiser regex. The repo has no linter, so ESLint adds a new toolchain.

### Cited Findings
- `no-restricted-syntax` takes strings or `{ selector, message }` objects (esquery selectors), e.g. `CallExpression[callee.name='setTimeout'][arguments.length!=2]` — [ESLint docs](https://eslint.org/docs/latest/rules/no-restricted-syntax)
- `no-restricted-imports` `patterns`: gitignore-style `group` or `regex`, `message`, `importNames`, `importNamePattern`, `allowTypeImports` (TS only), `!` negation (order matters, negation cannot re-include under an excluded parent dir) — [ESLint docs](https://eslint.org/docs/latest/rules/no-restricted-imports). Page has no flat-config examples. It matches the import specifier string (not resolved file), so aliases/relative paths must be enumerated — inference from description of "module paths"; relative-path coverage not verified on the page.
- eslint-plugin-boundaries latest 7.4.4 (published 2026-11-15; releases 7.4.2 11-05, 7.4.3 11-12), peerDependency `eslint >=6.0.0` — `npm view` (npm registry). Actively maintained.
- Its config: `settings["boundaries/elements"]` (`{type, pattern}`), `settings["boundaries/files"]` (categories), rule `boundaries/dependencies` with `default: "disallow"` and `policies` (`from`/`allow`/`disallow`, `message`); `boundaries.configs.recommended.rules` — [README](https://raw.githubusercontent.com/javierbrea/eslint-plugin-boundaries/master/README.md), [quick-start](https://www.jsboundaries.dev/docs/quick-start/)
- Captured path fragments can be reused in policies (exact syntax not found on pages read) — same.
- TS resolution: needs separate `eslint-import-resolver-typescript` with `settings["import/resolver"] = { typescript: { alwaysTryTypes: true } }`; reads tsconfig `paths` — [TS guide](https://www.jsboundaries.dev/docs/guides/typescript-support/)
- Latest ESLint is 10.15.0 (2026-11-16) — `npm view eslint`.

### Concrete config for the call-forbidding requirement (assembled from documented selector syntax; selectors NOT executed/tested here)
```js
// eslint.config.js (flat)
export default [{
  files: ["src/modules/*/routes.ts"],
  rules: {
    "no-restricted-syntax": ["error",
      { selector: "MemberExpression[object.name='container'][property.name='db']",
        message: "Routes must not touch container.db; call a service." },
      { selector: "CallExpression[callee.object.name='container'][callee.property.name='github']",
        message: "Routes must not call container adapters." },
      // via Fastify instance: app.container.db / fastify.container.github()
      { selector: "MemberExpression[object.property.name='container'][property.name=/^(db|github)$/]",
        message: "No container access in routes." }
    ],
    "no-restricted-imports": ["error", { patterns: [
      { group: ["**/adapters/**", "**/db/schema*"], message: "Layer violation", allowTypeImports: false }
    ]}]
  }
}];
```
Note: selectors match identifier names syntactically; destructuring (`const { db } = app.container`) or aliasing escapes them unless more selectors are added (e.g. `VariableDeclarator > ObjectPattern` on `app.container`) — inference.

### Inferences
- Import rules (dependency-cruiser) and syntax rules (ESLint) are complementary: the first resolves actual files incl. aliases; the second inspects AST. A pragmatic split: depcruise for import graph, ESLint (minimal config, only `no-restricted-syntax`, parser `typescript-eslint`) just for the container-access ban — or a vitest AST test (section 3).
- eslint-plugin-boundaries adds little over depcruise for this repo's regex-expressible rules and needs a resolver plugin; its main upside is editor feedback.

### Gaps
- boundaries capture syntax / "same capture" policies, and flat-config `files`-scoped `no-restricted-imports` example not found on pages read.
- Selector correctness not tested. Whether typescript-eslint is required to parse `.ts` (it is, practically — general knowledge, not sourced here).

## 3. ArchUnitTS, ts-arch, plain vitest architecture tests

### Takeaway
ArchUnitTS (`archunit` 2.5.5, 2026-11-13) is the maintained option; ts-arch (`tsarch` 5.4.1, last release 2024-12-23) appears stagnant and documents Jest only. Neither documented support for call/member-expression rules; a plain vitest test using the TypeScript compiler API or regex is the flexible fallback.

### Cited Findings
- `archunit` latest 2.5.5 published 2026-11-13; 2.5.3/2.5.4 on 2026-09-13 — `npm view archunit time` (npm registry). README claims "Active maintenance", three named maintainers, automated releases — [ArchUnitTS README](https://raw.githubusercontent.com/LukasNiessen/ArchUnitTS/main/README.md) (self-reported).
- API: `projectFiles().inFolder(...).shouldNot().dependOnFiles().inFolder(...)`, `await expect(rule).toPassAsync()`; `.should().haveNoCycles()`; custom file rules `withName('*.ts').should().adhereTo(fn, desc).check()` with `FileInfo` — same README. Vitest requires `globals: true` in vitest config — same.
- README does not state call/member-expression checks; its custom rule gets a `FileInfo` (contents likely accessible — unverified).
- `tsarch` latest 5.4.1 published 2024-12-23 (previous 5.4.0 2024-02-27) — `npm view tsarch time`. README: File API `filesOfProject().inFolder().shouldNot().dependOnFiles()`, slices API with PlantUML diagrams; examples use Jest (`tsarch/dist/jest`), no Vitest mention — [ts-arch README](https://raw.githubusercontent.com/ts-arch/ts-arch/master/README.md). README makes no maintenance claim.
- Plain vitest architecture test: no source read for this; see Inferences.

### Inferences
- ~11 months since ts-arch's last release at research date: treat as low-activity; no stated deprecation found.
- Plain vitest test (glob `src/modules/*/routes.ts`, parse with `typescript` `ts.createSourceFile`, walk for `PropertyAccessExpression` where name is `db`/`github`, plus walk `ImportDeclaration`) needs no new dependency (TypeScript already in repo) and fits "no linter" repo, runs in existing `pnpm test`. Cost: you own the code, no baseline support unless you hand-roll an allow-list.
- ArchUnitTS builds its own import graph; alias handling vs tsconfig paths not verified.

### Gaps
- No sources read for plain-vitest arch-test patterns, nor third-party reviews/benchmarks of ArchUnitTS/ts-arch. ArchUnitTS tsconfig path alias support and ESM `.js` handling not verified.

## 4. Grandfathering / baseline strategies

### Takeaway
dependency-cruiser's `--baseline` known-violations file and ESLint's bulk suppressions (`eslint-suppressions.json`) both provide ratcheting; ArchUnitTS/ts-arch/plain tests have none documented, so use hand-rolled allow-lists.

### Cited Findings
- depcruise: `--baseline` writes `.dependency-cruiser-known-violations.json`; `--ignore-known` hides them; `--baseline-mode shrink-only` supports ratcheting down — [cli.md](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/cli.md)
- ESLint bulk suppressions: `--suppress-all`, `--suppress-rule <rule>`, `--prune-suppressions`, `--pass-on-unpruned-suppressions`, `--suppressions-location`; file `eslint-suppressions.json` at project root, commit it; only rules at `"error"` are suppressed; fixing a suppressed violation without pruning makes ESLint exit non-zero ("unused suppression") — [ESLint suppressions](https://eslint.org/docs/latest/use/suppressions)
- Suppressions are per file path (and rule), counted — API needs `filePath` — same page. (A per-file count means a new violation of the same rule in an already-suppressed file may stay hidden — inference, page doesn't say.)

### Inferences
- depcruise known-violations match by rule+from+to, so a *new* violation in the same file to a different target is still caught — inference from the file's described purpose; format not read.
- For a legacy-heavy repo: depcruise baseline for import rules; for `container.*` call bans, either ESLint suppressions (requires adopting ESLint) or a vitest test with an explicit allow-list array of legacy files that shrinks over time.

### Gaps
- Version in which ESLint bulk suppressions landed (user said 9.24+) not stated on the page; not verified. Known-violations JSON schema not read.

## 5. Tradeoffs (speed, false positives, maintenance, no-linter fit)

### Takeaway
Best fit for this repo: dependency-cruiser for import/layer rules (+ baseline, CI step) and a small AST check for container access, either minimal ESLint or a vitest test. ArchUnitTS is a viable all-in-vitest alternative but less documented for baseline and syntax rules.

### Cited Findings
- depcruise has caching (`--cache`, since 11.14) and `includeOnly`/`exclude` to limit scope — [options-reference](https://raw.githubusercontent.com/sverweij/dependency-cruiser/main/doc/options-reference.md)
- `tsPreCompilationDeps: true` is documented as faster than default for TS code bases while including type-only deps — same.
- Maintenance snapshot (npm, 2026-11-23): dependency-cruiser 18.9.0 (11-22), eslint-plugin-boundaries 7.4.4 (11-15), archunit 2.5.5 (11-13), tsarch 5.4.1 (2024-12-23), eslint 10.15.0 (11-16).

### Inferences
- False positives: depcruise regexes need anchoring and escaped dots; mis-specified `pathNot` and unresolved aliases are the main risks; unresolved imports can silently pass if tsconfig is not set.
- Imports-only tools cannot see `app.container.db` — requires AST (ESLint selector / TS compiler API) or a convention change (inject only service functions into routes so there is nothing to call).
- Adding ESLint solely for one rule adds typescript-eslint + flat config + CI job in a repo with "no linter"; a vitest AST test or ArchUnitTS custom rule avoids a new toolchain but lacks editor squiggles and built-in suppression.

### Gaps
- No measured speed numbers for any tool on a codebase of this size; none found.
