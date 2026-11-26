# Scoping a pre-completion self-review to the uncommitted diff and routing by changed surfaces (skill `pr-self-review`)

Repo context checked (read-only): root CLAUDE.md lists four independent packages; `.claude/rules/` has `client-layout.md` and `server-layers.md`; `.claude/skills/` has per-domain skills (onion-architecture, client-layout, drizzle-orm-patterns, fastify-best-practices, next-best-practices, react-best-practices, react-testing-library, zod, security, postgresql-table-design, typescript-expert, engineering-insights); five CI workflows with `paths:` filters (`client.yml`: `client/**`; `server-unit.yml`/`server-integration.yml`: `server/**`; `reviewer-core.yml`: `reviewer-core/**` + `server/src/vendor/shared/**`; `e2e-web.yml`: `client/**`, `server/**`, `e2e/**`). Local note: `.claude/skills/README.md` describes rules as `.mdc` while the repo's rules are `.md`.

## (a) Collecting the right diff

### Takeaway
`git diff HEAD` covers staged plus unstaged tracked changes. Untracked files are NOT in it, so they must be added from `git status --porcelain`. Use NUL-separated output, `--numstat` to detect binary and size, and rename detection. For a whole-branch review, `A...B` or `--merge-base` gives the merge-base view.

### Cited Findings
- `git diff HEAD` is "Changes in the working tree since your last commit; what you would be committing if you run `git commit -a`", and the path limit form is `git diff HEAD -- <path>` — [git-diff](https://git-scm.com/docs/git-diff)
- `--name-status` letters: A, C, D, M, R, T, U, X; C and R carry a similarity score — [git-diff](https://git-scm.com/docs/git-diff)
- `-M`/`--find-renames[=n]` defaults to 50% similarity. `diff.renames` is on by default for porcelain `git diff`. `--no-renames` disables it — [git-diff](https://git-scm.com/docs/git-diff)
- `--diff-filter=` selects by status letters. Uppercase includes and lowercase excludes (e.g. `--diff-filter=ad` excludes added and deleted) — [git-diff](https://git-scm.com/docs/git-diff)
- `--numstat` is machine-friendly (`added<TAB>deleted<TAB>path`). Binary files print `-` `-` instead of counts. Renames print as `arch/{i386 => x86}/Makefile` — [git-diff](https://git-scm.com/docs/git-diff)
- `-z` with `--raw/--numstat/--name-only/--name-status` disables path quoting and uses NUL terminators. Without it, unusual characters are quoted per `core.quotePath` — [git-diff](https://git-scm.com/docs/git-diff)
- `--stat=<width>,<name-width>,<count>`: count limits output to the first N lines followed by `...`. `--shortstat` prints only the summary line — [git-diff](https://git-scm.com/docs/git-diff)
- `--no-color` forces plain output, overriding `color.ui` and `color.diff` — [git-diff](https://git-scm.com/docs/git-diff)
- Base selection: `git diff A...B` equals `git diff $(git merge-base A B) B` (changes on B since divergence). `A..B` means a direct two-tip comparison. `git diff --merge-base A` equals `git diff $(git merge-base A HEAD)` and compares against the working tree — [git-diff](https://git-scm.com/docs/git-diff)
- `git status --porcelain` (v1) is guaranteed stable for scripts. Paths are always repo-root-relative and never colored — [git-status](https://git-scm.com/docs/git-status)
- XY codes: X is index and Y is work tree. `??` is untracked. `R  old -> new` is a staged rename (blank Y). Blank X with `R` in Y is an unstaged rename. Unmerged states are DD/AU/UD/UA/DU/AA/UU — [git-status](https://git-scm.com/docs/git-status)
- With `-z`, v1 rename entries drop `->` and the order reverses to `new<NUL>old`. Paths are unquoted — [git-status](https://git-scm.com/docs/git-status)
- `--untracked-files=all` (`-uall`) lists each file inside untracked directories. The default `normal` shows only the directory, which would hide new files in a new folder — [git-status](https://git-scm.com/docs/git-status)
- `--porcelain=v2` gives `1`/`2`/`u` records, `? path` for untracked, and rename score such as `R100` — [git-status](https://git-scm.com/docs/git-status)
- Precedent for the base: GitHub Actions path filters use a three-dot diff for PRs, a two-dot diff for pushes, and cap at 3,000 files, 1,000 commits and a diff timeout — [GitHub Actions workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
- Precedent: Nx affected defaults `base` to `main` and `head` to the current file system, so working-tree changes count. It honours `.gitignore`. A lockfile change affects every task by default — [Nx affected](https://nx.dev/docs/features/ci-features/affected)
- Community skills split into two camps. Branch-diff: huggingface/diffusers `self-review` uses `git diff main...HEAD`, with `git log main..HEAD` as a fallback when the branch trails main — [skills.sh diffusers self-review](https://www.skills.sh/huggingface/diffusers/self-review). Working-tree: glyph `self-review` and quickapps code-review use `git diff` plus `git diff --cached` or `git diff HEAD` (search snippets only, page not readable) — [search results via skills.sh/skillsmp](https://skillsmp.com/creators/hamidfzm/glyph/claude-skills-self-review)

### Inferences
- Recommended file list for the router: `git status --porcelain=v1 -z -uall`. This captures staged, unstaged, untracked, renames, deletions and unmerged states in one stable parse. Then `git diff HEAD --numstat -M -z` for sizes and binary flags, and `git diff HEAD -M --no-color -- <paths>` per surface for patches.
- Untracked files have no diff. The skill must read them directly (or use `git diff --no-index /dev/null <file>`), and should skip binary or large files and report them as "not reviewed".
- Default scope = `HEAD` (uncommitted only). If the working tree is clean but the branch is ahead of main, fall back to `git diff $(git merge-base origin/main HEAD)` (or `main...HEAD`) and say so. The scope should be stated in the output header.
- Size guard: use `--numstat` totals and a threshold. Above it, review per surface, patch by patch, and list skipped files. The Actions 3,000-file cap shows tools truncate silently, so the skill should say explicitly when it truncates.
- Unmerged (`U*`) entries: stop and report. A review of a half-resolved merge is meaningless.

### Gaps
- `git ls-files --others --exclude-standard` was not covered by a fetched page. `status -uall` is the sourced equivalent.
- No primary source for diff size limits specific to LLM context. The thresholds are a design choice.
- I did not verify the behaviour of `git diff HEAD` in a repo with no commits (initial repo). Not relevant to dev-digest.

## (b) Classifying files into surfaces and selecting checklists/skills

### Takeaway
Every precedent uses an ordered list of path globs mapped to instructions or checks (Copilot `applyTo`, CodeRabbit `path_instructions`, Actions `paths`, Claude Code rule `paths`, Danger file-list rules). Global files (lockfiles) are treated as cross-cutting. Docs-only skipping is the `paths-ignore` pattern.

### Cited Findings
- Copilot path-specific instructions: `.github/instructions/NAME.instructions.md`, frontmatter `applyTo: "glob,glob"` (comma-separated). Globs `*`, `**`, `src/**/*.py`. `excludeAgent: "code-review"|"cloud-agent"` limits the consumer. When a repo-wide file also exists, both are used. During code review, instructions are read from the PR head branch — [GitHub Docs: repository custom instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot)
- CodeRabbit: `reviews.path_instructions` is a list of `{path: <glob>, instructions: <text>}`. Minimatch glob with brace expansion. Each instruction is capped at 20,000 characters. An invalid glob causes the entry to be skipped. Instructions do not change which files are reviewed (that is `path_filters`). Negation is not documented — [CodeRabbit path instructions](https://docs.coderabbit.ai/configuration/path-instructions)
- Claude Code path-scoped rules: `.claude/rules/*.md` with YAML frontmatter `paths:` (list of globs). They load when Claude reads, writes or edits a matching file. Patterns are relative to the directory containing `.claude`. Rules with no `paths` load every session — [Claude Code memory docs](https://code.claude.com/docs/en/memory)
- Community reports on `paths:`: some say YAML arrays were silently ignored in some versions. Issues #17204, #22170 and #21858 report path rules not loading, including user-level rules. Cursor uses `globs:` while Claude uses `paths:`. Conflicting; the official doc example uses a list — [search results incl. issue #17204](https://github.com/anthropics/claude-code/issues/17204), [issue #22170](https://github.com/anthropics/claude-code/issues/22170)
- Caveat of path-scoped rules for review: they trigger on tool reads/edits of matching files, not on "file appears in a diff". A review skill therefore cannot rely on them to fire for files it only sees via `git diff`; it should read the relevant skill/rule files itself. (Derived from the trigger description in [memory docs](https://code.claude.com/docs/en/memory), see Inferences.)
- GitHub Actions: `paths` runs if at least one changed path matches. `paths-ignore` skips only if ALL changed paths match (e.g. `docs/**`). `!` negation needs at least one positive pattern, and order matters (later pattern wins). `paths` and `paths-ignore` cannot be combined for one event. Skipped workflows leave required checks "Pending" — [GitHub Actions workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
- Danger.js rules read `danger.git.modified_files` / `created_files`: warn "Changes were made to package.json, but not to yarn.lock"; changelog reminder (skippable when marked trivial); new-file check excluding `node_modules`/`test`. Levels `message`/`warn`/`fail`/`markdown` — [Danger JS](https://danger.systems/js/)
- Nx: a lockfile change affects all tasks by default. `projectsAffectedByDependencyUpdates: "auto"` narrows it to projects whose resolved deps changed — [Nx affected](https://nx.dev/docs/features/ci-features/affected)
- This repo already encodes surface boundaries in CI path filters: `reviewer-core.yml` lists `server/src/vendor/shared/**` because of the tsconfig alias; `e2e-web.yml` triggers on client, server and e2e — local files `.github/workflows/*.yml`; also root CLAUDE.md "CI path filters encode cross-package aliases".

### Inferences
- A mapping table (first-match-wins plus additive cross-cutting tags) generalises. Proposed surfaces for dev-digest, in two layers:
  - Package surfaces: `server/src/modules|adapters|platform/**` (onion-architecture, fastify-best-practices, security), `server/src/db/schema/**` (drizzle-orm-patterns, postgresql-table-design), `server/src/db/migrations/**` (protected), `server/test/**`, `client/src/app/**` and `client/src/components/**` (client-layout, react-best-practices, next-best-practices), `client/**/*.test.ts(x)` (react-testing-library), `reviewer-core/**`, `e2e/flows/*.flow.json`, `docs/agent-prompts/**` (agent-prompts README: prompts and `Review` output contract), `.github/workflows/**`, `*.md` docs, `**/INSIGHTS.md`.
  - Cross-cutting tags (additive, can co-fire): contracts (`server/src/vendor/shared/**`, `client/src/vendor/shared/**`), lockfiles and `package.json` (4 locations), migrations and schema, CI, protected files.
- Selection by union: a file can fire several surfaces (a `.tsx` under `client/` is client + test if `.test.tsx`). Keep the router table in one place (a `routing.md` reference file) so skills list stays maintainable. Copilot and CodeRabbit both keep the mapping as data separate from the instructions text.
- Docs-only skip should mirror `paths-ignore`: skip only if EVERY changed file matches docs globs (`**/*.md`, `docs/**`), not if any does. Note that in this repo `CLAUDE.md`/`INSIGHTS.md` and agent prompts under `docs/agent-prompts/` are behavioural (prompts), so they should be excluded from the "docs-only" skip, or at least the prompt directory should route to its own surface.
- Because path-scoped rules need a Read/Edit to fire, the skill should explicitly say "read `.claude/rules/<x>.md` and `.claude/skills/<y>/SKILL.md` for each fired surface", not assume auto-loading. Load only the fired ones (progressive disclosure) to protect context. CodeRabbit's 20,000-character cap is a useful budget analogue for per-surface checklists.
- Never-silently-drop rule: unclassified files go to an "other" bucket and get a generic checklist, similar to Actions where unmatched paths simply do not trigger anything (a risk to avoid).

### Gaps
- No primary docs found for CODEOWNERS ordering semantics, reviewdog, pre-commit `files:` regex, Turborepo affected, or Cursor rule `globs` — not fetched in the call budget. CODEOWNERS (last-match-wins), pre-commit `files`/`exclude` regexes and Cursor `globs:` are known precedents but unsourced here.
- CodeRabbit negation, and whether Copilot `applyTo` supports `!` negation, are undocumented in the pages read.
- Behaviour of Claude Code `paths:` arrays across versions is conflicting in community sources, and I could not confirm a specific bug-fix version.

## Cross-cutting checks a router should add

### Takeaway
The precedents confirm "file A changed without file B" as the canonical rule shape (Danger lockfile and changelog rules). The repo's own CLAUDE.md supplies the dev-digest-specific pairs.

### Cited Findings
- Pair rule precedent: warn when `package.json` changed but lockfile did not — [Danger JS](https://danger.systems/js/)
- Repo rules: committed migrations in `server/src/db/migrations/*.sql` and `meta/` are immutable. A schema change goes in `server/src/db/schema/*.ts` and then `pnpm db:generate` creates a new migration. Lockfiles change only as a side effect of `pnpm add/remove` or `npm install <pkg>`, committed with their `package.json`. A contract change in `server/src/vendor/shared` must be mirrored into the drifting `client/src/vendor/shared` copy and affects reviewer-core. A new alias needs matching `paths:` in `.github/workflows/*.yml`. API must stay unauthenticated and loopback-bound. Typecheck is the static gate; no linter. — local file /mnt/workspace/personal/dev-digest/CLAUDE.md
- Test naming and location rules (client colocated `Name.test.tsx`, `server/test/<area>[-<topic>].test.ts`, `reviewer-core/test/` named after source, `*.it.test.ts` for DB-backed, e2e flows `NN-<name>.flow.json` next free number) — local file /mnt/workspace/personal/dev-digest/CLAUDE.md
- Editing a reviewer agent prompt or `Review` output contract has its own README: `docs/agent-prompts/README.md` — local file /mnt/workspace/personal/dev-digest/CLAUDE.md
- Completion-gate precedent: obra/superpowers `verification-before-completion` ("NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE": run the command, read the output, then claim) — mirror pages only, repo not read: [mcpservers.org](https://mcpservers.org/agent-skills/obra/verification-before-completion)

### Inferences
Concrete cross-cutting checks (each is a path-pair predicate on the name-status list):
1. Migration `A`/`M`/`D`/`R` in `server/src/db/migrations/**` where the file existed in HEAD (status M, D, R) is a blocking finding (immutable history). New `A` migration without a `server/src/db/schema/*.ts` change is suspicious. A schema change without a new migration is blocking ("run `pnpm db:generate`"). Hand-written SQL is hard to detect by path alone; check that `meta/` snapshot and journal changed with it.
2. Lockfile changed without sibling `package.json` is blocking. `package.json` dependency change without lockfile is blocking. Check the lockfile belongs to the right manager (pnpm for server/client, npm for reviewer-core/e2e). A pnpm-lock appearing in reviewer-core/e2e, or a `package-lock.json` in server/client, is wrong.
3. `server/src/vendor/shared/**` changed: require matching change in `client/src/vendor/shared/**` (or an explicit "not applicable" note); also run reviewer-core typecheck/tests because it consumes the source via alias. The reverse (client copy edited alone) is a finding.
4. Source changed without tests: map source to expected test location by naming rules above and report "no test touched" as a non-blocking suggestion (blocking only for bugfixes/new routes, a policy choice). Test-only diffs: check tests were not weakened (deleted assertions, `.skip`, `.only`).
5. Workflow or alias change (`tsconfig` paths, new cross-package import): check `.github/workflows/*.yml` `paths:` include it.
6. Contract or prompt change in `docs/agent-prompts/**` or the `Review` schema: route to the agent-prompts README.
7. New e2e flow: number must be next free two-digit `NN`.
8. Docs-only diff (every file matches docs globs): skip the review, print one line with the reason. Do not skip when a `.md` is a prompt or a skill file whose behavior matters.
9. Per-package verification commands from CLAUDE.md as the completion gate, run only for touched packages: server `pnpm typecheck` and unit tests; client `pnpm typecheck` and `pnpm test`; reviewer-core `npm run typecheck` and `npm test`; e2e `npm run typecheck`. Maps onto the superpowers principle of fresh evidence. Integration tests need Docker (`*.it.test.ts`), so the skill should say when it skipped them.
10. Nx's lockfile default (a lockfile change affects everything) suggests: a lockfile change should trigger verification for the owning package only, not all four.
11. Generated or secret-bearing files: flag `.env*`, credentials in the diff. (General practice, not sourced here.)

### Gaps
- No source quantifying which of these checks give the best signal; selection is a judgement.
- How the repo's `.claude/rules/server-layers.md` and `client-layout.md` frame their `paths` was not read in detail.

## (c) Output format for findings

### Takeaway
Existing tools converge on: a severity or label per finding, an explicit blocking flag, file anchoring, a confidence filter to suppress false positives, and a short summary over a detailed list. Conventional Comments gives a compact vocabulary for label plus blocking decoration.

### Cited Findings
- Conventional Comments format: `<label> [decorations]: <subject>` then optional discussion. Labels: praise, nitpick, suggestion, issue, todo, question, thought, chore, note (plus typo, polish, quibble). Decorations: `(blocking)`, `(non-blocking)`, `(if-minor)`, plus organization-defined ones such as `(security)`, `(test)`, `(ux)`. Keep decoration sets minimal. At least one sincere praise is recommended. `issue` works best paired with a suggestion; `nitpick`, `thought` and `note` are non-blocking by nature — [conventionalcomments.org](https://conventionalcomments.org/)
- Anthropic's official Code Review plugin (`/code-review`): each finding gets a 0-100 confidence score and only findings at or above a default 80 are reported. Most sources describe four parallel agents (CLAUDE.md compliance, bug detection, git history context, others). Terminal output by default, PR comment with `--comment`. The threshold lives in the command file — [claude.com plugin page](https://claude.com/plugins/code-review) and secondary summaries ([claudedigest](https://claudedigest.com/ecosystem/claude-plugin-claude-code-plugins-code-review), [deepwiki](https://deepwiki.com/anthropics/claude-plugins-official/7.2.4-code-review-plugin)). Disagreement: one Japanese page says five reviewers. I could not fetch the primary command file (GitHub raw returned 404, blob page 503), so details of its false-positive list and output template are unverified.
- Danger severity ladder: `message` (info), `warn` (non-blocking), `fail` (blocking), `markdown` (free text) — [Danger JS](https://danger.systems/js/)
- This session's built-in `code-review` skill description (local environment) takes an effort level and reports "from few high-confidence findings to many, some uncertain", with `--max-findings`, which is the same confidence-versus-recall dial — local skill list, not a web source.
- CodeRabbit separates "what to check" (`path_instructions`) from "which files" (`path_filters`) — [CodeRabbit path instructions](https://docs.coderabbit.ai/configuration/path-instructions)

### Inferences
- Suggested findings record (human + machine): `severity` (blocker | should-fix | nit) mapped to Conventional Comments labels (`issue (blocking)`, `issue/suggestion (non-blocking)`, `nitpick`), `surface` tag, `path:line` (line from the new-side hunk header; for deleted files use the path and `-` line), `confidence` (high/medium/low, or 0-100 with a cutoff such as 80 as Anthropic's plugin does for a self-review a lower cutoff is defensible because the author can dismiss quickly), `why` and `fix`. Verification evidence (command plus pass/fail) in a separate block.
- Output layout: (1) header with scope (HEAD vs merge-base, counts of staged/unstaged/untracked, skipped/binary/truncated files), (2) surfaces fired and checklists loaded, (3) verdict line (READY / FIX FIRST / NOTHING TO REVIEW), (4) blockers first, then non-blocking, then "not checked". Cap findings and suppress style the repo has no linter for (CLAUDE.md says no linter, so format nits are noise).
- Machine-readable: a fenced JSON block after the human summary lets a hook or later `--fix` pass consume it. No primary source found showing the exact JSON schema used by the Anthropic plugin or CodeRabbit.
- The self-review reviews the agent's own work, so an independent read (fresh subagent given only the diff and checklist) reduces anchoring. Superpowers' `requesting-code-review` uses a reviewer subagent for this reason (mirror sources only).

### Gaps
- Primary source for the Anthropic plugin's exact prompt and output template not retrieved.
- CodeRabbit's finding severity taxonomy and Copilot review comment format were not fetched.
- No data on false-positive rates for any tool.

## Existing skills and commands with pre-commit or pre-PR review

### Takeaway
Many community skills exist, most diff against main and few route by file type; none found that routes by surface across independent packages. Quality is unverified for all (search snippets and mirrors only).

### Cited Findings
- huggingface/diffusers `self-review`: applies the same rubric as the `@claude` CI reviewer to the PR diff; `git diff main...HEAD`; four steps (collect, review, report, iterate); the CI reviewer only covers `src/diffusers/`, `tests/`, `.ai/`, the skill adds docs and scripts. Only step 1 was visible. Quality: from a large, reputable project, but partially read — [skills.sh](https://www.skills.sh/huggingface/diffusers/self-review)
- hamidfzm/glyph `self-review`: reviews the working diff against a code-standards checklist before commit or push, reads `git diff` plus `git diff --cached`, fixes findings and re-runs gates. Quality: small personal repo, snippet only — [skillsmp](https://skillsmp.com/creators/hamidfzm/glyph/claude-skills-self-review)
- quickapps-code-review (EPAM): uses `git diff HEAD`, keeps a checklist of patterns reviewers flag. Snippet only — [skillsmp](https://skillsmp.com/skills/epam-ai-dial-quickapps-backend-claude-skills-quickapps-code-review-skill-md)
- Hermes "requesting code review": staged changes first (`git diff --cached`) then fallback, self-review checklist before dispatching a reviewer. Snippet only — [Hermes docs](https://hermes-agent.nousresearch.com/docs/user-guide/skills/bundled/software-development/software-development-requesting-code-review)
- Others listed but not read: wuchendi `pre-pr-review`, hegeldev `self-review`, junit `pre-commit-review`, b1tank `diff-check`, athola `git-workspace-review`, tsaol `git-review` — [search results on skills.sh/skillsmp](https://www.skills.sh/wuchendi/skills/pre-pr-review)
- obra/superpowers: `requesting-code-review` (dispatch a code-reviewer subagent; "review early, review often") and `verification-before-completion` (fresh evidence before claims). Read only through mirrors (mcpservers.org, tessl.io) — [tessl.io](https://tessl.io/skills/github/obra/superpowers/requesting-code-review)

### Inferences
- The gap in existing community skills (diff scope fixed, no surface routing, no cross-cutting pair checks) is where `pr-self-review` can add value. Pattern worth copying: separate "collect diff", "route", "review per surface", "verify", "report" steps, and a reviewer subagent for independence.

### Gaps
- Awesome-claude-code lists and the actual GitHub repo contents were not opened; no star counts or maintenance status checked. The Anthropic plugin source and obra/superpowers SKILL.md files should be read directly (e.g. via `gh`) before copying wording.
