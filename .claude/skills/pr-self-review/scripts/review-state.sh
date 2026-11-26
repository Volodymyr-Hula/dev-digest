#!/usr/bin/env bash
# Local-change state for pr-self-review.
#
#   review-state.sh collect                     changed files + deterministic checks + hash
#   review-state.sh hash                        hash of the reviewable change set ("none" if empty)
#   review-state.sh diff [-- <path>...]         unified diff base..working tree (incl. untracked)
#   review-state.sh verdict <hash> PASS|BLOCK [critical-line...]
#                                               record a verdict (with its base) for the guard hook
#   review-state.sh show-verdict                print the stored verdict file
#
# "Local changes" = everything between merge-base(HEAD, <base>) and the working tree:
# branch commits, staged, unstaged and untracked (non-ignored) files. <base> is
# $PR_SELF_REVIEW_BASE (an origin/<branch> ref), default origin/main. The hash is
# content-based, so committing already-reviewed changes does not invalidate the verdict.
#
# Verdict file: line 1 hash, line 2 PASS|BLOCK, line 3 "base <ref>", then critical findings.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BASE_REF="${PR_SELF_REVIEW_BASE:-origin/main}"

# Paths no review skill covers: changing only these never needs a review.
EXCLUDES=(
  ':(exclude,glob)**/*.md'
  ':(exclude)reports'
  ':(exclude)research_notes'
  ':(exclude).claude'
)

VERDICT_FILE="$(git rev-parse --git-path pr-self-review.verdict)"

[[ "$BASE_REF" =~ ^origin/[A-Za-z0-9._/-]+$ ]] || {
  echo "review-state: base must be an origin/<branch> ref, got '$BASE_REF'" >&2
  exit 1
}

base() {
  git merge-base HEAD "$BASE_REF" 2>/dev/null || {
    echo "review-state: cannot resolve merge-base with $BASE_REF (run: git fetch origin ${BASE_REF#origin/})" >&2
    exit 1
  }
}

# Tree object of the current working tree, untracked files included, .gitignore respected.
work_tree() {
  local idx
  idx="$(mktemp)"
  cp "$(git rev-parse --git-path index)" "$idx" 2>/dev/null || true
  GIT_INDEX_FILE="$idx" git add -A . >/dev/null 2>&1
  GIT_INDEX_FILE="$idx" git write-tree
  rm -f "$idx"
}

cmd_hash() {
  local b t d
  b="$(base)"; t="$(work_tree)"
  d="$(git diff --no-ext-diff --binary "$b" "$t" -- . "${EXCLUDES[@]}")"
  if [[ -z "$d" ]]; then echo none; else printf '%s\n%s' "$b" "$d" | git hash-object --stdin; fi
}

cmd_diff() {
  [[ "${1:-}" == "--" ]] && shift
  local b t
  b="$(base)"; t="$(work_tree)"
  if [[ $# -eq 0 ]]; then set -- . "${EXCLUDES[@]}"; fi
  git diff --no-ext-diff "$b" "$t" -- "$@"
}

package_of() {
  case "$1" in
    client/*) echo client ;;
    server/*) echo server ;;
    reviewer-core/*) echo reviewer-core ;;
    e2e/*) echo e2e ;;
    *) echo root ;;
  esac
}

cmd_collect() {
  local b t names
  b="$(base)"; t="$(work_tree)"
  names="$(git diff --no-ext-diff --name-status -M "$b" "$t" -- . "${EXCLUDES[@]}")"

  echo "BASE $b ($BASE_REF)"
  echo "BRANCH $(git rev-parse --abbrev-ref HEAD)"
  echo "COMMITS $(git rev-list --count "$b"..HEAD)"
  echo "HASH $(cmd_hash)"
  echo
  echo "## FILES (status<TAB>package<TAB>path)"
  if [[ -z "$names" ]]; then
    echo "(none — nothing to review)"
    return 0
  fi
  while IFS=$'\t' read -r st p1 p2; do
    local p="${p2:-$p1}"
    printf '%s\t%s\t%s\n' "${st:0:1}" "$(package_of "$p")" "$p"
  done <<<"$names"

  echo
  echo "## CHECKS (severity<TAB>message)"
  local found=0

  # 1. Committed migrations are immutable: only additions (A) are allowed, plus the journal.
  while IFS=$'\t' read -r st p1 p2; do
    [[ -z "$st" ]] && continue
    case "$p1" in
      server/src/db/migrations/meta/_journal.json) continue ;;
      server/src/db/migrations/*)
        if [[ "${st:0:1}" != "A" ]]; then
          printf 'critical\tcommitted migration changed (%s): %s — add a new migration via pnpm db:generate instead\n' "${st:0:1}" "$p1"
          found=1
        fi ;;
    esac
  done <<<"$names"

  # 2. Lockfile changes only together with the package's package.json.
  local pkg lock
  for pair in server:pnpm-lock.yaml client:pnpm-lock.yaml reviewer-core:package-lock.json e2e:package-lock.json; do
    pkg="${pair%%:*}"; lock="${pair#*:}"
    if grep -qE $'\t'"$pkg/$lock\$" <<<"$names" && ! grep -qE $'\t'"$pkg/package.json\$" <<<"$names"; then
      printf 'critical\t%s/%s changed without %s/package.json — lockfiles change only via pnpm/npm add/remove\n' "$pkg" "$lock" "$pkg"
      found=1
    fi
  done

  # 3. Shared contracts: server copy is the source of truth, client copy must mirror it.
  if grep -qF $'\tserver/src/vendor/shared/' <<<"$names" && ! grep -qF $'\tclient/src/vendor/shared/' <<<"$names"; then
    printf 'major\tserver/src/vendor/shared changed but client/src/vendor/shared did not — mirror the contract change\n'
    found=1
  fi

  # 4. reviewer-core is not covered by the e2e CI path filter.
  if grep -qF $'\treviewer-core/' <<<"$names"; then
    printf 'info\treviewer-core changed — run ./scripts/e2e.sh locally (CI e2e does not trigger on reviewer-core/**)\n'
    found=1
  fi

  [[ $found -eq 0 ]] && echo "(all passed)"
  return 0
}

cmd_verdict() {
  local want="${1:?hash required}" v="${2:?PASS|BLOCK required}"
  shift 2
  [[ "$v" == PASS || "$v" == BLOCK ]] || { echo "verdict must be PASS or BLOCK" >&2; exit 1; }
  local now
  now="$(cmd_hash)"
  if [[ "$now" != "$want" ]]; then
    echo "review-state: files changed since collect ($want → $now); re-run the review" >&2
    exit 1
  fi
  {
    echo "$now"
    echo "$v"
    echo "base $BASE_REF"
    for line in "$@"; do echo "$line"; done
  } >"$VERDICT_FILE"
  echo "verdict $v recorded for $now"
}

case "${1:-}" in
  collect) cmd_collect ;;
  hash) cmd_hash ;;
  diff) shift; cmd_diff "$@" ;;
  verdict) shift; cmd_verdict "$@" ;;
  show-verdict) cat "$VERDICT_FILE" 2>/dev/null || echo "(no verdict)" ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
