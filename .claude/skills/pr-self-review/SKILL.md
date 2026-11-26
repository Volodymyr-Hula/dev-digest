---
name: pr-self-review
description: Reviews all local changes (branch commits not in origin/main + staged + unstaged + untracked) against the project skills before `git push` or opening a PR — routes client files to the UI skills and server files to the architecture/backend skills, runs deterministic CLAUDE.md checks and typecheck, and records a PASS/BLOCK verdict; any critical finding blocks push/PR. Use before every `git push`, `gh pr create` or `gh pr merge`, when the guard hook says the changes were not reviewed, or when asked for a self-review of local changes.
argument-hint: "[base-ref, default origin/main]"
allowed-tools: Bash(.claude/skills/pr-self-review/scripts/*), Bash(git *), Bash(pnpm typecheck), Bash(npm run typecheck)
---

# PR self-review

Review the local change set before it leaves the machine. Report only — never fix, stage, commit or push as part of this skill. Fixes happen afterwards, when the user asks.

The guard hook (`scripts/guard-pr.sh`, wired in `.claude/settings.json`) refuses `git push`, `gh pr create` and `gh pr merge` until step 6 recorded `PASS` for exactly the current change set. Any edit afterwards invalidates the verdict; committing already-reviewed changes does not.

The base defaults to `origin/main`; for a PR into another branch pass `origin/<branch>`. The verdict stores the base, the hook checks against it, and `gh pr create` must target that same branch (`--base`, default `main`) or the hook blocks it.

Run all commands from the repo root. `S=.claude/skills/pr-self-review/scripts`.

## 1. Collect

```
$S/review-state.sh collect
```

With an argument (`origin/<branch>`), prefix this and the step 6 `verdict` call with it: `PR_SELF_REVIEW_BASE=<base-ref> $S/review-state.sh …`. If merge-base fails, run `git fetch origin <branch>` and retry.

- `## FILES` says `(none …)` → reply "Nothing to review" and stop. With base `origin/main` no verdict is needed, the hook lets push through; with another base record `verdict <HASH> PASS` (step 6) — the hook requires one.
- Keep `HASH` — step 6 needs it.
- Every `critical` line under `## CHECKS` is a finding (source `check`).

## 2. Route

Open [references/routing.md](references/routing.md). Group the files by surface (`client`, `server`) and give each surface the union of skills its files match. Files no row matches go to "not covered by a skill".

## 3. Typecheck

Run the typecheck of every touched package (table in routing.md), in parallel. A failing typecheck is a `critical` finding (source `typecheck`) — quote the first errors with `file:line`.

## 4. Review

For each surface with files, spawn one `general-purpose` subagent with the prompt from [references/reviewer-brief.md](references/reviewer-brief.md), slots filled: surface, BASE sha, skill/rule/CLAUDE.md file list, changed file list. Spawn all surfaces in one message so they run in parallel. Do not paste the diff or your own summary of the change into the prompt — the reviewer fetches the diff itself.

Skip the subagent for a surface whose changes are trivial (only renames, deletions or ≤ 5 changed lines) and review it yourself with the same brief.

## 5. Consolidate

- Drop duplicates; drop any `critical` that lacks a quoted rule and `file:line` (downgrade to `major`).
- Spot-check every `critical`: open the cited line and confirm it. A finding you cannot confirm is downgraded, not kept "to be safe".
- `security` findings of high severity or above are `critical`.

## 6. Verdict

- At least one `critical` → `BLOCK`, otherwise `PASS`.
- Record it with the `HASH` from step 1; each critical finding is one argument:

```
$S/review-state.sh verdict <HASH> BLOCK "<file>:<line> — <rule> — <problem>" ...
$S/review-state.sh verdict <HASH> PASS
```

If it reports that files changed since collect, start over at step 1.

## 7. Report

```
## pr-self-review: PASS | BLOCK
Base <sha> (<base-ref>) · <N> commits · <M> files · skills: <list>

### Critical (blocks push/PR)
- <file>:<line> — <problem>. Rule: <skill> §<section> "<quote>". Fix: <one line>

### Major / Minor
- …

### Checks & typecheck
- <check results, typecheck per package>

### Not covered by a skill
- <files>
```

Omit empty sections. On `BLOCK`, end with: "Push/PR is blocked until the critical findings are fixed and `/pr-self-review` is re-run." Then stop — do not start fixing unless the user asks.
