---
name: create-pr
description: Opens or updates a GitHub PR from the current feature branch into a destination branch (default main) — offers commits for uncommitted files, fixes commit types on unpushed commits, fetches the destination and merges it in when conflicts are predicted, warns when the PR is too large or mixes unrelated themes, writes the PR description from the commits and diff, then pushes and creates/edits the PR (push is gated by the pr-self-review hook). Use when asked to create, open or update a PR, or to write a PR description for the current branch.
argument-hint: "[destination branch, default main] [--draft]"
allowed-tools: Bash(.claude/skills/create-pr/scripts/*), Bash(git *), Bash(gh pr *)
---

# Create PR

Everything that changes history or leaves the machine — commit, merge, reword, drop, push, PR — happens only after the user's explicit "yes" to that exact step. Never force-push, never push `main`/`master`, no `Co-Author` or `Claude-Session` lines.

Run from the repo root. `S=.claude/skills/create-pr/scripts`. `DEST` = first argument, or `main`. Any `ERROR` line from a script stops the skill: report it and the fix it names.

## 1. Preflight

```
$S/pr-context.sh preflight $DEST
```

- `PR <n> …` → **update mode**: the PR exists; keep `OLD_BODY` for step 7.
- `## UNCOMMITTED` not clean → list the files grouped by module and propose commits (`feat|fix|test|docs|refactor[(scope)]: …`, one per logical change). Files that don't belong in git (scratch notes, reports, local data) are listed separately and never committed — offer `.gitignore` instead. Commit after "yes". If the user declines, stop: a dirty tree breaks merge and the review hash.

## 2. Commit types

```
$S/pr-context.sh commits $DEST
```

For every `bad` line:
- `local` and `MERGES 0` → propose a new subject. After "yes", write a plan file (`<sha>\treword\t<subject>` per line) and run `$S/rewrite-local.sh origin/$DEST <plan>`. It prints a backup ref; mention it.
- `pushed`, or `MERGES > 0` → warn only; fixing would need force-push or would flatten merges.

Merge commits are not checked.

## 3. Sync with the destination

```
$S/pr-context.sh sync $DEST
```

- `CONFLICTS none (up to date …)` → continue.
- `CONFLICTS none (clean merge predicted)` → ask whether to merge `origin/$DEST` now (tests then run against the final state) or leave it to GitHub. On yes: `git merge --no-edit origin/$DEST`.
- Conflicts listed → show them and, after "yes", `git merge --no-commit origin/$DEST`. Resolve together with the user, file by file; never pick `--ours`/`--theirs` wholesale on code.
  - `lockfile` → take the destination's (`git checkout --theirs <file>`), re-run the package's install (pnpm 10 in `server/`/`client/`, npm elsewhere), stage the result.
  - `migration` → stop and ask: two branches added migrations; the fix is regenerating ours via `pnpm db:generate`, not editing SQL.
  - Commit with `git commit --no-edit` after the user confirms the resolution.

Use merge, never rebase, for the destination: a rebase of pushed commits needs force-push.

## 4. Context

```
$S/pr-context.sh context $DEST
```

Read the diff for the files under `## FILES` (`git diff <BASE>..HEAD -- <path>`); for a large PR read the biggest and most central files fully and skim the rest. Read commit bodies (`git log --format=%B <BASE>..HEAD`) — they often state the why.

## 5. Size and themes

- `OVER limit` in `## SIZE`, or two or more `feat`/`fix` clusters that share no files (cluster by scope, package and the files under each `@@` commit) → propose a split: which commits go to a new branch, its name, and what stays.
- Default is to continue as is; the side commits go to "Also in this branch".
- On "yes" to a split: `git switch -c <new> origin/$DEST`, `git cherry-pick <shas>` (oldest first), switch back, then drop them here with `$S/rewrite-local.sh origin/$DEST <plan>` (`<sha>\tdrop`) — only if they are `local` and `MERGES 0`; otherwise leave them and say so. Re-run step 4.

## 6. Description

Write title and body per [references/pr-template.md](references/pr-template.md). Facts only from the diff, commits and commands run in this session. Every `## FLAGS` line must appear in the body (After pulling, Notes or Test plan).

## 7. Approve

Save the body to `$(git rev-parse --git-path create-pr/body.md)` and show title + body. In update mode also show `diff -u <OLD_BODY> <body>` and ask: replace, merge sections (keep manual edits from the old body), or keep the old one. Apply the user's edits until they approve.

## 8. Push and PR

After the user approves pushing:

```
git push -u origin HEAD
gh pr create --base <dest> --title "<title>" --body-file "$(git rev-parse --git-path create-pr/body.md)"   # add --draft if asked
gh pr edit <n> --title "<title>" --body-file "$(git rev-parse --git-path create-pr/body.md)"           # update mode instead
```

Write the literal destination in `--base` (the hook reads it from the command text; a shell variable is not expanded there). The `pr-self-review` guard hook gates `git push` and `gh pr create`. When it blocks, run the `pr-self-review` skill with base `origin/$DEST` and retry; on `BLOCK` stop, and after the user's fixes are committed re-run from step 4, regenerating only the sections the fixes touch. If the push is rejected as non-fast-forward, someone pushed to the branch: pull, then restart at step 3.

## 9. Report

PR URL, mode (created/updated), commits made or reworded (with the backup ref), merge done or not, open warnings (unfixed commit types, unmirrored contract, unchecked Test plan items). If conflict resolution changed code, run the `engineering-insights` wrap-up.
