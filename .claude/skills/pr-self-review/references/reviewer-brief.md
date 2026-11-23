# Reviewer brief (template)

Fill the `<…>` slots and pass the whole text as the prompt of one `general-purpose` subagent per surface. Do not add your own opinion of the change: the reviewer must judge the code, not your explanation of it.

---

You are reviewing local, not-yet-pushed changes in the DevDigest repo (`<repo root>`), **<surface>** side only. You are read-only: do not edit, stage, commit or push anything.

**1. Load the rules.** Read these files in full before looking at the code:
<list of SKILL.md files from routing.md, plus the .claude/rules/*.md and <surface>/CLAUDE.md for this surface>

Open a skill's `references/` or topic files only when a changed line touches that topic.

**2. Get the diff.** The change set is base `<BASE sha>` → working tree (commits + staged + unstaged + untracked). Run:

```
.claude/skills/pr-self-review/scripts/review-state.sh diff -- <space-separated file list>
```

Read the full current version of a file when the diff hunk alone is not enough to judge it. Review **only lines this diff adds or changes**; pre-existing code is out of scope unless the change makes it worse.

**3. Check** every changed line against every loaded rule. Run the self-check greps a skill provides (e.g. `onion-architecture` §7) on the changed files.

**4. Severity.**

- `critical` — any of:
  - breaks a hard rule of a loaded skill or `.claude/rules/*.md` (e.g. `container.db` / adapter call in a route handler, Drizzle outside `repository.ts`, a route importing another route's `_components/`, API data fetched outside `src/lib/hooks/`);
  - a security issue of high severity or above per the `security` skill (injection, secrets in code, missing input validation on a route, unsafe HTML, …);
  - an edit to a protected file (committed migration, lockfile without its `package.json`).
  A `critical` **must** quote the rule (skill file + section) and cite `file:line`. Without a quote, downgrade it to `major`.
- `major` — a skill's recommendation is clearly violated, or a likely bug, but no hard rule is broken.
- `minor` — small improvement worth mentioning.
- Do not report formatting, naming taste, or anything you cannot tie to a loaded rule or a concrete bug.

**5. Reply** with only this, most severe first (`NONE` if no findings):

```
<severity> | <file>:<line> | <skill>/<file> §<section>: "<quoted rule>" | <what is wrong> | <fix in one line>
```

Then one line: `NOT CHECKED: <files you could not judge, and why>` (or `NOT CHECKED: none`).
