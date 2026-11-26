# Claude Code mechanics for a "pr-self-review" dispatcher skill (uncommitted diff -> route to domain skills before "done")

Research date: 2026-11-23. Primary sources read: code.claude.com docs (skills, sub-agents, hooks, hooks-guide, memory, commands, code-review-local, goal, workflows), raw GitHub for anthropics/claude-plugins-official code-review command and obra/superpowers skills. General skill authoring (descriptions, progressive disclosure, 500-line cap) is NOT repeated; see `research_notes/Onion архітектура TS бекенду/skill_authoring.md`. Version numbers cited are from the docs; Claude Code moves fast, so re-check before relying on them.

## 1. Can one skill load/invoke other skills? (Skill tool vs reading SKILL.md vs subagent `skills:` preload) and context costs

### Takeaway
The docs never document a skill body calling the Skill tool on another skill, but nothing prohibits it: the Skill tool is a normal model tool, and `user-invocable: false` hides a skill only from the user `/` menu, not from Claude. The three mechanisms differ mainly in who pays the context: Skill tool and Read both land the full body in the dispatcher's own context; `skills:` preload injects full bodies into a subagent's context, keeping the main session clean. `disable-model-invocation: true` blocks both Skill-tool use and subagent preload.

### Cited Findings
- `user-invocable: false`: "Claude Code hides it from the `/` menu and doesn't run it when you type `/name`"; the invocation table says user can invoke = No, Claude can invoke = Yes. To keep Claude from invoking via the Skill tool use `disable-model-invocation: true` (doc line: "With `user-invocable: false`, you can't invoke the skill, but Claude still can") — [Skills docs](https://code.claude.com/docs/en/skills)
- `disable-model-invocation: true` "Also prevents the skill from being preloaded into subagents and from running when a session-scoped scheduled task fires" — [Skills docs](https://code.claude.com/docs/en/skills); sub-agents page: "You can't preload skills that set `disable-model-invocation: true`, since preloading draws from the same set of skills Claude can invoke. This includes the bundled `/verify` skill" — [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- The fetched sub-agents text did not mention how `user-invocable: false` interacts with preloading; by the "same set Claude can invoke" rule it should be preloadable, but this is an inference, test it — [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- `skills:` field in a subagent definition: "The full content of each listed skill is injected into the subagent's context at startup, up to the first 32 distinct names in the list" — [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- That field "controls which skills are preloaded, not which skills the subagent can access: without it, the subagent can still discover and invoke project, user, and plugin skills through the Skill tool during execution." Parent skills are not inherited; a subagent "doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read." Built-in agents don't preload skills. To block skill use: omit `Skill` from `tools` or add to `disallowedTools` — [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- Skill-to-skill calling from a SKILL.md body: the skills docs describe only user-side stacking ("`/write-tests /fix-issue 123`", first skill plus up to five more, terminal prompt only; with `-p`/Agent SDK only the first is loaded; expansion stops at a forked skill such as `/code-review`) — [Skills docs](https://code.claude.com/docs/en/skills). No official statement found on a skill telling Claude to call another via the Skill tool.
- Permissions: `Skill(name)` exact / `Skill(name *)` prefix rules gate the Skill tool; denying `Skill` disables all skills — [Skills docs](https://code.claude.com/docs/en/skills)
- Skill content lifecycle: invoked content stays in conversation; after compaction each skill keeps first 5,000 tokens, shared 25,000 token budget across re-attached skills — [Skills docs](https://code.claude.com/docs/en/skills)
- Unverified community claims (search snippets only): a third-party internals doc says bundled `/verify` can call `/simplify` ("nested-skill trigger"); a gist warns that referencing one skill from another loads both; a tutorial suggests a "## Requirements" section telling the agent to run another skill first — [cc-haha internals](https://raw.githubusercontent.com/NanmiCoder/cc-haha/master/docs/en/internals/skills.md), [mindstudio](https://www.mindstudio.ai/blog/claude-code-skill-collaboration-pattern)
- Skill `paths:` frontmatter: "Glob patterns for the files that activate this skill", comma-separated string or YAML list, relative to the cwd (same format as path rules); skill does not activate for files outside that directory, e.g. a sibling worktree — [Skills docs](https://code.claude.com/docs/en/skills)

### Inferences
- Three dispatch options by context cost: (a) dispatcher says "invoke skill X via the Skill tool" -> X's full SKILL.md enters main context and persists (counts toward the 25k post-compaction budget); (b) dispatcher says "Read `.claude/skills/X/SKILL.md`" -> works even for `disable-model-invocation: true` skills (it is just a file), same context cost, but bypasses skill permissions/telemetry; (c) dispatcher spawns reviewer subagent(s) with `skills: [onion-architecture, fastify-best-practices, drizzle-orm-patterns]` so bodies go into the subagent's context and only findings return. (c) is cheapest for the main session and gives fresh eyes, but one agent definition = one static skill list, so per-surface routing means one agent file per surface (e.g. `server-reviewer`, `client-reviewer`) or a generic agent told to Read SKILL.md files.
- Domain skills hidden with `user-invocable: false` still work for (a) and (c). Do NOT set `disable-model-invocation: true` on domain skills the dispatcher should invoke or preload.
- Keep the dispatcher a thin router (routing table + procedure); domain skills carry the rules.

### Gaps
- No doc statement on whether a skill invoked by another skill's instructions is treated differently (permissions, nesting). Needs an empirical test.
- The `user-invocable: false` x preload interaction is unconfirmed; the sub-agents page's last ~15k chars were not read.

## 2. Skill frontmatter semantics relevant to the dispatcher

### Takeaway
`context: fork` + `agent` makes the skill body the task prompt of a fresh subagent with no conversation history. `!`cmd`` injection runs before the model sees the skill, so `git diff --stat` can pre-populate the router, but a failing command aborts the whole invocation. `allowed-tools` only pre-approves (does not restrict).

### Cited Findings (all [Skills docs](https://code.claude.com/docs/en/skills))
- `context: fork`: "Set to `fork` to run in a forked subagent context." Starts "a new subagent of the type set in the `agent` field and gives it the skill content as its prompt. The subagent doesn't see your conversation history." "Despite the name, a skill with `context: fork` doesn't run in a fork of the current conversation." Warning: `context: fork` "only makes sense for skills with explicit instructions"; pure guideline skills return nothing useful.
- `agent`: built-ins `Explore`, `Plan`, `general-purpose`, or custom from `.claude/agents/`; default `general-purpose`. Explore/Plan start without CLAUDE.md and git status; a forked skill with `agent: Explore` gets none of your CLAUDE.md files (put everything needed in SKILL.md).
- Forked skills run in the background by default ("you keep working while it runs, and its result arrives in your conversation when it completes"); `background: false` waits in the same turn. Waits automatically under `-p`/Agent SDK and `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`. A background fork has the narrower background-subagent tool set; use `background: false` for the full set. Background fork edits fall outside `/rewind` checkpoints.
- A fork-type skill ends user-side stacking expansion.
- `allowed-tools`: "Tools Claude can use without asking permission during the turn that invokes this skill. The grant clears when you send your next message." "It does not restrict which tools are available." `disallowed-tools` removes tools while the skill is active.
- `argument-hint`: shown after the command name in autocomplete. `$ARGUMENTS`, `$0..$N`, named `arguments`; if no placeholder, Claude Code appends `ARGUMENTS: <value>`. Also `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`.
- `model` / `effort`: apply for the rest of the current turn; with `context: fork`, `model` sets the forked subagent's model. Values as `/model`, or `inherit`.
- `hooks` (skill frontmatter): "Hooks that Claude Code registers when the skill is invoked and keeps running for the rest of the session." Skipped if managed settings lock hooks via `strictPluginOnlyCustomization`.
- Dynamic injection: "The `!`<command>` syntax runs shell commands before the skill content is sent to Claude. The command output replaces the placeholder." Single pass (output not re-scanned). Inline form recognised only at line start or after whitespace; multi-line via a ```! fenced block. "A failed command aborts the entire skill invocation... Claude never sees the skill content" (non-zero exit fails, except exit 1 from some search/compare commands; append `|| true`). Injected commands don't prompt, but deny rules abort and non-allowed commands abort unless pre-approved via `allowed-tools`. `disableSkillShellExecution` replaces commands with a policy placeholder. Doc example: `!`gh pr diff --name-only`` in a forked skill with `allowed-tools: Bash(gh *)`.
- `shell:` selects bash (default) or powershell for `!` blocks.
- Listing: description+when_to_use capped at 1,536 chars; budget 1% of context window; `skillOverrides` can set `name-only`, `user-invocable-only`, `off`.
- Portability: outside Claude Code (claude.ai uploads / Skills API) unknown keys (`context`, `agent`, `hooks`, `argument-hint`, ...) cause a hard error; Claude Code itself ignores unknown fields.

### Inferences
- A router prelude like ``!`git status --porcelain; git diff --stat HEAD || true` `` gives the dispatcher a deterministic changed-file list without a model tool call; add `allowed-tools: Bash(git *)` so it runs unprompted. `git diff HEAD` fails in a repo with no commits, and untracked files need `git status --porcelain` or `git ls-files -o --exclude-standard`.
- Inline (no fork) when the dispatcher must fix findings in the main context; `context: fork` when you want an unanchored report. A forked dispatcher fanning out needs the Agent tool (nesting allowed to 3 layers per sub-agents docs, but background tool sets are narrower).

### Gaps
- Skill-hook limits on the hooks page and the "Skill content lifecycle" text beyond the compaction numbers were not read.

## 3. Making the review happen reliably "before done": Stop hook vs CLAUDE.md vs user command

### Takeaway
Only a Stop hook is deterministic. CLAUDE.md is documented as "context, not enforced configuration". A Stop hook can force a continuation (exit 2 / `decision: block`) with documented loop protections (`stop_hook_active`, a default 8-consecutive-block cap that resets when Claude calls a tool). Hooks cannot invoke a skill directly; they feed text back, so the hook's `reason` must tell Claude to run the skill.

### Cited Findings
- "Claude treats CLAUDE.md files as context, not enforced configuration" — [Memory docs](https://code.claude.com/docs/en/memory). Skills docs say rules that "must hold every time" belong in a hook, which runs "whether or not Claude is following the skill" — [Skills docs](https://code.claude.com/docs/en/skills)
- Stop event: runs when the main agent has finished responding; not on user interrupt; API errors fire `StopFailure` instead — [Hooks reference](https://code.claude.com/docs/en/hooks)
- Stop input: `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` plus common fields (`cwd`, `transcript_path`...). "`stop_hook_active` is `true` when Claude Code is already continuing as a result of a stop hook. Check this value ... to avoid blocking on a condition that will never resolve." — [Hooks reference](https://code.claude.com/docs/en/hooks)
- 8-consecutive-continuation cap: "after stop hooks have continued the turn eight times in a row, Claude Code overrides the next block and ends the turn. The count ... resets each time Claude calls a tool." Raise with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` — [Hooks reference](https://code.claude.com/docs/en/hooks). Recommended guard: `if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then exit 0; fi` — [Hooks guide](https://code.claude.com/docs/en/hooks-guide)
- Decision control: `decision: "block"` + required `reason`; omit to allow stop. Exit 2 also blocks (stderr becomes Claude's explanation). Alternative `hookSpecificOutput.additionalContext` (hookEventName "Stop") continues the conversation as non-error "Stop hook feedback" with the same loop protections. `continue: false` takes precedence over exit 2 and ends the turn — [Hooks reference](https://code.claude.com/docs/en/hooks)
- SubagentStop: same fields plus `agent_id`, `agent_type`, `agent_transcript_path`; exit 2 prevents the subagent from stopping. A `Stop` hook in a subagent's frontmatter is converted to `SubagentStop` at runtime — [Hooks reference](https://code.claude.com/docs/en/hooks), [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- Hook types: command, http, mcp_tool, prompt, agent. Prompt hook on Stop: model returns `{"ok": false, "reason": ...}` -> Claude keeps working; `"impossible": true` allows stop. Agent hooks (experimental, "may change"; prefer command hooks in production): subagent with Read/Grep/Glob etc., default 60s timeout, up to 50 tool turns, no `impossible` field; doc example "Verify that all unit tests pass" on Stop — [Hooks guide](https://code.claude.com/docs/en/hooks-guide). Timeout defaults: 600s command/http/mcp_tool, 30s prompt, 60s agent — [Hooks reference](https://code.claude.com/docs/en/hooks)
- `if` conditions are only evaluated on tool events (PreToolUse, PostToolUse, ...); "On other events, a hook with `if` set never runs", so `if` cannot filter Stop. Stop has no matcher — [Hooks reference](https://code.claude.com/docs/en/hooks). The "only when there are uncommitted changes" check must live inside the script.
- `/goal` is "a wrapper around a session-scoped prompt-based Stop hook"; an evaluator (small fast model) judges the condition only from what the conversation shows; "It doesn't run commands or read files independently" — [Goal docs](https://code.claude.com/docs/en/goal). Stops looping when Claude makes no tool use for several turns. Session-scoped, typed by the user.
- Hook locations: `.claude/settings.json` (project, shareable), `~/.claude/settings.json`; skill/agent frontmatter hooks live for the component's lifetime; plugin `hooks/hooks.json` — [Hooks guide](https://code.claude.com/docs/en/hooks-guide), [Skills docs](https://code.claude.com/docs/en/skills)
- Practitioner pattern (superpowers `verification-before-completion`): purely instruction-based, "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE", triggered via its description when the agent is about to claim completion; no hook enforcement — [SKILL.md](https://raw.githubusercontent.com/obra/superpowers/main/skills/verification-before-completion/SKILL.md). superpowers `requesting-code-review` is also instruction-based ("Mandatory: after each task... before merging") — [SKILL.md](https://raw.githubusercontent.com/obra/superpowers/main/skills/requesting-code-review/SKILL.md)

### Inferences
- Robust recipe: project `.claude/settings.json` Stop command hook -> script that (1) exits 0 if `stop_hook_active` is true; (2) exits 0 if `git status --porcelain` is empty (consider excluding docs-only paths such as `research_notes/`, `reports/`); (3) exits 0 if a marker shows the review already ran for this diff (store `git diff HEAD | sha256sum` in a temp file keyed by `session_id`); otherwise emits `{"decision":"block","reason":"Uncommitted changes in <paths>. Run the pr-self-review skill, fix findings, then finish."}`. The hash check beats `stop_hook_active` alone because that flag is true only during the immediate continuation.
- Without hash/baseline gating, a hook that blocks whenever the tree is dirty would fire on every turn in a dirty tree (this repo's tree is dirty at session start), hit the 8-block cap, and nag after read-only Q&A turns. Compare against a baseline captured at SessionStart/UserPromptSubmit so only session edits count.
- Layered approach: hook = enforcement, skill = review logic, one CLAUDE.md line = intent hint, `/pr-self-review` = manual escape hatch. A prompt-type Stop hook is easiest but sees only conversation text (like `/goal`); an agent-type hook can inspect git but is experimental.
- A hook cannot call a skill; its `reason` text is the routing channel, and Claude then calls the Skill tool (so the dispatcher must not be `disable-model-invocation: true`).

### Gaps
- No primary-source practitioner write-up of a diff-aware Stop hook with hash gating found; the recipe is my design inference.
- Whether `additionalContext` vs `block` differ in the counter beyond docs wording ("same loop protections") is untested.

## 4. Fresh-context review: subagent vs forked skill vs Workflow tool vs in-context

### Takeaway
All delegated forms start with a clean context (no conversation history), which gives an unanchored second pass; in-context review is anchored on the author's reasoning. A custom subagent with `skills:` preload is the most controllable; `context: fork` is the simplest packaging; Workflows are for large scripted fan-outs and heavier than needed for a 2-6 surface diff.

### Cited Findings
- "Each subagent starts with a fresh, isolated context window." Initial context = system prompt, task message, CLAUDE.md files, git status snapshot, preloaded skills, sibling roster; a conversation "fork" is the exception and inherits history — [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- Nesting: subagents can spawn subagents "up to three layers below the main conversation"; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` disables; concurrent subagent limit 20 by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`) — [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- Agent tool renamed from Task in v2.1.63; model order: per-invocation param, definition `model`, `CLAUDE_CODE_SUBAGENT_MODEL`, parent's model — [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- Workflows: JS script orchestrating subagents via `agent()`, `pipeline()`, `parallel()`; runtime holds intermediate results so Claude's context holds only the final answer; up to 16 concurrent agents (default), 1,000 agents per run; can have "independent agents adversarially review each other's findings"; saved to `.claude/workflows/`, run as `/<name>`; per-run approval prompt in manual mode; no mid-run user input; no filesystem/shell in the script itself; token-heavy ("a single run can use meaningfully more tokens"); can be disabled via `disableWorkflows`; `/workflow-authoring` needs v2.1.248+ — [Workflows docs](https://code.claude.com/docs/en/workflows). Doc example: "review every file changed in this PR... merge the per-file findings into one ranked summary".
- Per docs, with subagents/skills "Claude is the orchestrator... every result goes into a context window"; with a workflow "the script holds the loop" — [Workflows docs](https://code.claude.com/docs/en/workflows)
- Anthropic's own `/code-review` runs "as a background subagent with its own context window, so it doesn't fill your conversation"; `/simplify` runs four review agents in parallel — [Code review local](https://code.claude.com/docs/en/code-review-local), [Commands](https://code.claude.com/docs/en/commands)
- superpowers `requesting-code-review`: dispatches a `general-purpose` subagent with only description + requirements + `BASE_SHA`/`HEAD_SHA`; "The reviewer never receives the coordinator's session history"; warns against reviewing inline because it consumes coordinator context — [SKILL.md](https://raw.githubusercontent.com/obra/superpowers/main/skills/requesting-code-review/SKILL.md)

### Inferences
- Unanchored ranking: Workflow agents ~ subagent ~ forked skill (all fresh) >> in-context. If the dispatcher passes the author's own summary of "what I changed and why" to the reviewer, anchoring returns; pass the diff/ranges plus the task requirement only (superpowers pattern).
- Parallel per-surface reviewers: dispatcher classifies changed paths, then issues several Agent calls in ONE message (client-reviewer with `skills: [client-layout, react-best-practices, react-testing-library]`, server-reviewer with `skills: [onion-architecture, fastify-best-practices, drizzle-orm-patterns]`), each only if its surface changed. Limits are generous (20 concurrent). Each reviewer pays its own preloaded skill bodies, so fan-out pays off only when several surfaces changed or the diff is large.
- Workflow tool is overkill unless the diff is very large or verifier agents are wanted; its per-run approval prompt is friction for a "before done" gate, and a hook cannot start it (only Claude can call it).
- Forked skill vs custom subagent: output arrives asynchronously unless `background: false`, which matters for a gate that must finish before "done".

### Gaps
- Not verified: whether a custom agent named in a forked skill's `agent:` field also preloads its own `skills:` (docs table implies system prompt comes from the agent type; unclear).
- No token-cost measurements per mechanism.

## 5. How official/built-in review commands are structured

### Takeaway
Anthropic's `/code-review` plugin command is an orchestrator prompt: cheap eligibility/CLAUDE.md-discovery steps, 4 parallel reviewers (2 CLAUDE.md compliance, 2 bug finders on changed lines), then one validation subagent per issue and dropping unvalidated findings. The bundled `/code-review` skill is closed (no SKILL.md on disk) but documented as a background forked subagent with effort levels; `/simplify` = 4 parallel cleanup agents; `/security-review` = branch diff vs origin default.

### Cited Findings
- Plugin command (anthropics/claude-plugins-official `plugins/code-review/commands/code-review.md`; the older `anthropics/claude-code/plugins/code-review` path returned 404): `allowed-tools` limited to `gh` read/comment commands plus `mcp__github_inline_comment__create_inline_comment`; `description: "Code review a pull request"`. Steps: (1) Haiku eligibility check; (2) Haiku finds CLAUDE.md paths (root + dirs of modified files); (3) Sonnet summarises the diff; (4) 4 parallel agents: 1-2 Sonnet CLAUDE.md compliance (only CLAUDE.md on the file's path or parents), 3 Opus obvious-bug scan of the diff, 4 Opus security/logic in introduced code limited to changed lines; all get PR title+description; (5) a validation subagent per issue from agents 3-4 (Opus for bugs, Sonnet for CLAUDE.md); (6) drop any not validated; (7-9) terminal output, optional `--comment` inline comments, one per unique issue. "If you are not certain an issue is real, do not flag it." False-positive exclusions: pre-existing issues, apparent bugs that are correct, nitpicks, linter-catchable, general quality unless CLAUDE.md requires, lint-ignored, style, input-dependent — [raw command file](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/code-review/commands/code-review.md) (summarised by the fetch tool, not read verbatim)
- Marketplace listing and DeepWiki describe 0-100 confidence scoring with default threshold 80 (an earlier design had 5 Sonnet agents + Haiku scoring); the raw file I read uses validation subagents instead, so the threshold-80 description may be outdated — [Claude marketplace listing](https://claude.com/plugins/code-review) (search snippet only)
- Bundled `/code-review [low|medium|high|xhigh|max|ultra] [--fix] [--comment] [--max-findings n] [pr#|branch|path]`, alias `/review`: no target = branch commits ahead of upstream plus uncommitted changes; in a terminal it runs as a forked/background subagent with its own context; reports as text (or `ReportFindings` tool in the desktop host); `low` = fewest, most-confident findings, `medium`..`max` broaden; follows CLAUDE.md (not REVIEW.md); `ultra` = cloud multi-agent review (needs claude.ai auth). Claude can start it on its own when asked in plain language; restrict via `skillOverrides: {"code-review": "user-invocable-only"}`. A project skill named `code-review` replaces the bundled one (alias `/review` keeps the bundled). Named `/simplify` before v2.1.147 — [Code review local](https://code.claude.com/docs/en/code-review-local)
- `/simplify [target]`: "Four review agents run in parallel, covering reuse of existing helpers, simplification, efficiency, and whether the change is at the right level of abstraction"; no bug hunting — [Commands](https://code.claude.com/docs/en/commands)
- `/security-review`: "Analyze the changes on your current branch for security vulnerabilities. Reviews the diff between your branch and origin's default branch"; needs an `origin` remote — [Commands](https://code.claude.com/docs/en/commands)
- `/verify`: builds and runs the app and observes the result; Claude cannot run it on its own — [Commands](https://code.claude.com/docs/en/commands), [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- `/batch`: decomposes into 5-30 units, one background subagent per unit in an isolated worktree — [Commands](https://code.claude.com/docs/en/commands)

### Inferences
- Design lessons: (a) routing by file location, as with per-path CLAUDE.md discovery, mirrors our path-based skill routing; (b) pass reviewers intent text but not the author's reasoning; (c) a separate verify pass filters false positives, which matters for a self-review gate that should not produce noisy blockers; (d) an explicit false-positive exclusion list; (e) cheap models for triage, strong for bug-hunting.
- Overlap risk: bundled `/code-review` already reads the uncommitted diff plus CLAUDE.md. The dispatcher's unique value is domain-skill routing; it could leave generic correctness to `/code-review` (Claude can start it) and add domain checks.

### Gaps
- Bundled `/code-review` internals (agent count, verification) are not public.
- pr-review-toolkit (anthropics plugin) agents were not examined.

## 6. Dispatcher/router skill examples that pick sub-skills by changed file paths

### Takeaway
No primary-source example of a skill that maps changed file paths to other skills was found. Closest official mechanisms are declarative and path-based but not diff-based: `.claude/rules/*.md` `paths:` rules and skill `paths:` frontmatter, both triggered by Claude touching matching files, not by a diff.

### Cited Findings
- Path-scoped rules: "A path-scoped rule loads when Claude uses the Read, Write, or Edit tool on a matching file" and for single-file Bash reads like `cat`/`head`; patterns relative to the directory holding `.claude`; rules with `paths:` "load again on demand" after compaction; brace expansion supported — [Memory docs](https://code.claude.com/docs/en/memory)
- Skill `paths:` (same glob format) activates a skill for files Claude works on within the cwd tree — [Skills docs](https://code.claude.com/docs/en/skills)
- Nested `.claude/skills/` load when Claude works on files in that subdirectory; same-name nested skills get directory-qualified variants with an instruction to "invoke the one whose directory holds the files it's working on" — [Skills docs](https://code.claude.com/docs/en/skills). A built-in path-routing precedent.
- Anthropic's plugin command resolves per-file CLAUDE.md by walking changed files' directories — [raw command](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/code-review/commands/code-review.md)
- A community "skill-composer" (notque/claude-code-toolkit) appears in search results; contents not read, unverified — [skills.sh](https://skills.sh/notque/claude-code-toolkit/skill-composer)

### Inferences
- Path rules load only in the context that touched the file; the docs' subagent startup context lists CLAUDE.md and preloaded skills, not path rules, so a fresh reviewer probably will not have them unless told to read them (inference; verify).
- Routing table for this repo (put as globs in the dispatcher): `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/container.ts` -> onion-architecture (+ fastify-best-practices for `routes.ts`); `server/src/db/schema/**`, repositories, migrations -> drizzle-orm-patterns (+ protected-files rule: never hand-edit migrations/lockfiles, per root CLAUDE.md); `client/src/**/*.tsx` -> react-best-practices; `client/**/*.test.ts(x)` -> react-testing-library; new/moved files under `client/src` or `client/messages` -> client-layout; `server/src/vendor/shared/**` -> contract-mirroring check into `client/src/vendor/shared` (a CLAUDE.md gotcha).

### Gaps
- No real-world path-based dispatcher skill found from primary sources; treat the above as design, not precedent.
- Not searched: wshobson/agents, anthropics/skills repo, GitHub code search for router skills.

## Summary of mechanism trade-offs (for the report writer)
| Need | Mechanism | Deterministic? | Main-context cost | Notes |
|---|---|---|---|---|
| Force review before done | Stop command hook (exit 2 / block) | Yes | tiny (reason text) | needs `stop_hook_active` guard, 8-block cap, dirty-tree/diff-hash gate in script; `if` cannot filter Stop |
| Same, model-judged | Stop prompt/agent hook, `/goal` | Mostly | tiny + evaluator tokens | agent hooks experimental; prompt hook sees only conversation |
| Intent only | CLAUDE.md line / skill description | No ("context, not enforced") | small | cheapest, least reliable |
| Manual | `/pr-self-review` (user-invocable) | n/a | n/a | fallback |
| Domain rules into review | Skill tool / Read SKILL.md | model-driven | full body per skill in main ctx | persists; 5k/25k compaction limits |
| Domain rules into review | subagent `skills:` preload | yes at spawn | bodies in subagent ctx only | `disable-model-invocation: true` skills cannot be preloaded; max 32 |
| Fresh eyes | Agent tool / `context: fork` / Workflow | yes | findings only | fork = background by default; Workflow heavy |
