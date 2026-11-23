#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Blocks `git push`, `gh pr create` and `gh pr merge`
# unless pr-self-review recorded PASS for the current local change set.
# Exit 0 = allow, exit 2 = block (stderr goes back to Claude).
#
# The review base comes from the verdict file ("base origin/<branch>", line 3); files
# written before that line existed mean origin/main. `gh pr create` must target the
# reviewed base (`--base`/`-B`, default main). An empty change set passes without a
# verdict only against origin/main — otherwise a base next to HEAD would skip review.
set -uo pipefail

input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null || true)"
[[ -z "$cmd" ]] && exit 0

# `git [opts] push` (incl. `git -C dir push`) or `gh pr create|merge`, anywhere in a compound command.
grep -Eq '(^|[^[:alnum:]_-])(git[[:space:]]+([^;&|]*[[:space:]])?push|gh[[:space:]]+pr[[:space:]]+(create|merge))([^[:alnum:]_-]|$)' <<<"$cmd" || exit 0

block() { echo "pr-self-review: $*" >&2; exit 2; }

dir="$(cd "$(dirname "$0")" && pwd)"
vfile="$(git rev-parse --git-path pr-self-review.verdict)"

base="origin/main"
findings_from=3
if [[ -f "$vfile" ]] && [[ "$(sed -n 3p "$vfile")" == base\ * ]]; then
  base="$(sed -n 3p "$vfile")"; base="${base#base }"
  findings_from=4
fi
[[ "$base" =~ ^origin/[A-Za-z0-9._/-]+$ ]] || block "invalid review base '$base' in $vfile. Re-run the pr-self-review skill."

# `gh pr create` must open the PR against the reviewed base.
if grep -Eq '(^|[^[:alnum:]_-])gh[[:space:]]+pr[[:space:]]+create([^[:alnum:]_-]|$)' <<<"$cmd"; then
  target="$(grep -Eo '(^|[[:space:]])(--base[=[:space:]]+|-B[[:space:]]*)[^[:space:];&|]+' <<<"$cmd" | head -1 \
    | sed -E 's/^[[:space:]]*(--base[=[:space:]]+|-B[[:space:]]*)//; s/^["'\'']//; s/["'\'']$//')"
  target="origin/${target:-main}"
  if [[ "$target" != "$base" ]]; then
    block "the review was against $base, but the PR targets $target. Run the pr-self-review skill with base $target."
  fi
fi

hash="$(PR_SELF_REVIEW_BASE="$base" "$dir/review-state.sh" hash 2>&1)" \
  || block "cannot compute local change state: $hash"

if [[ "$hash" == none ]]; then
  [[ "$base" == origin/main ]] && exit 0
  [[ -f "$vfile" ]] || block "no changes against $base and no verdict. Run the pr-self-review skill."
fi

[[ -f "$vfile" ]] || block "local changes were not reviewed. Run the pr-self-review skill before push/PR."

stored_hash="$(sed -n 1p "$vfile")"
verdict="$(sed -n 2p "$vfile")"

[[ "$stored_hash" == "$hash" ]] \
  || block "local changes differ from the last reviewed state (base $base). Re-run the pr-self-review skill before push/PR."

if [[ "$verdict" != PASS ]]; then
  {
    echo "pr-self-review: BLOCKED — critical findings must be fixed before push/PR:"
    sed -n "$findings_from,\$p" "$vfile"
  } >&2
  exit 2
fi

exit 0
