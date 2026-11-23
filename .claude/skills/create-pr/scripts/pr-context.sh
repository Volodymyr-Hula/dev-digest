#!/usr/bin/env bash
# Git/GitHub state for the create-pr skill. Only `sync` changes anything (it fetches).
#
#   pr-context.sh preflight [dest]   branch checks, upstream, existing open PR, uncommitted files
#   pr-context.sh sync [dest]        fetch origin/<dest>, ahead/behind, predicted merge conflicts
#   pr-context.sh commits [dest]     commit subjects vs allowed types, local or already pushed
#   pr-context.sh context [dest]     commits with files, files by package, size, flags
#
# dest defaults to main. Lines starting with ERROR mean: stop and report.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TYPES_RE='^(feat|fix|test|docs|refactor)(\([^)]+\))?!?: .+'
# Excluded from the size check: lockfiles, drizzle snapshots, test snapshots.
NOISE_RE='(^|/)(pnpm-lock\.yaml|package-lock\.json)$|^server/src/db/migrations/meta/|\.snap$'
MAX_FILES=40
MAX_LINES=1500

STATE_DIR="$(git rev-parse --git-path create-pr)"

package_of() {
  case "$1" in
    client/*) echo client ;;
    server/*) echo server ;;
    reviewer-core/*) echo reviewer-core ;;
    e2e/*) echo e2e ;;
    .claude/*) echo claude ;;
    docs/*) echo docs ;;
    *) echo root ;;
  esac
}

remote_ref() {
  local r="origin/$1"
  git rev-parse --verify -q "$r^{commit}" >/dev/null || {
    echo "ERROR $r not found locally — run: pr-context.sh sync $1"
    exit 0
  }
  echo "$r"
}

cmd_preflight() {
  local d="$1" b up behind ahead
  b="$(git rev-parse --abbrev-ref HEAD)"
  echo "BRANCH $b"
  echo "DEST $d"

  [[ "$b" == HEAD ]] && echo "ERROR detached HEAD — check out a feature branch"
  [[ "$b" == "$d" ]] && echo "ERROR current branch is the destination branch"
  [[ "$b" == main || "$b" == master ]] && echo "ERROR PRs are opened from feature branches only"
  git ls-remote --exit-code --heads origin "$d" >/dev/null 2>&1 \
    || echo "ERROR origin has no branch '$d'"

  if up="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
    git fetch -q origin "$b" 2>/dev/null || true
    read -r behind ahead < <(git rev-list --left-right --count "$up...HEAD")
    echo "UPSTREAM $up behind=$behind ahead=$ahead"
    (( behind > 0 )) && echo "ERROR $up has $behind commit(s) missing locally — pull them first (force-push is not allowed)"
  else
    echo "UPSTREAM none"
  fi

  local pr
  if ! pr="$(gh pr list --head "$b" --state open --json number,url,baseRefName \
      --jq '.[0] | select(.) | "\(.number)\t\(.baseRefName)\t\(.url)"' 2>&1)"; then
    echo "ERROR gh failed: $pr"
  elif [[ -z "$pr" ]]; then
    echo "PR none"
  else
    local num base url
    IFS=$'\t' read -r num base url <<<"$pr"
    mkdir -p "$STATE_DIR"
    gh pr view "$num" --json body --jq .body >"$STATE_DIR/old-body.md"
    echo "PR $num base=$base $url"
    echo "OLD_BODY $STATE_DIR/old-body.md"
    [[ "$base" != "$d" ]] && echo "ERROR open PR #$num targets '$base', not '$d' — changing the base is the user's call"
  fi

  echo
  echo "## UNCOMMITTED (git status --porcelain)"
  local st
  st="$(git status --porcelain)"
  echo "${st:-(clean)}"
}

cmd_sync() {
  local d="$1" r behind ahead out rc
  git fetch -q origin "$d"
  r="$(remote_ref "$d")"
  read -r behind ahead < <(git rev-list --left-right --count "$r...HEAD")
  echo "REMOTE $r $(git rev-parse --short "$r")"
  echo "BEHIND $behind"
  echo "AHEAD $ahead"
  (( ahead == 0 )) && echo "ERROR nothing to merge: the branch has no commits that $r lacks"
  if (( behind == 0 )); then
    echo "CONFLICTS none (up to date with $r)"
    return 0
  fi

  rc=0
  out="$(git merge-tree --write-tree --name-only --no-messages HEAD "$r" 2>&1)" || rc=$?
  case $rc in
    0) echo "CONFLICTS none (clean merge predicted)" ;;
    1)
      echo "CONFLICTS (kind<TAB>path)"
      tail -n +2 <<<"$out" | while IFS= read -r p; do
        [[ -z "$p" ]] && continue
        case "$p" in
          */pnpm-lock.yaml|*/package-lock.json) printf 'lockfile\t%s\n' "$p" ;;
          server/src/db/migrations/*) printf 'migration\t%s\n' "$p" ;;
          *) printf 'code\t%s\n' "$p" ;;
        esac
      done ;;
    *) echo "ERROR git merge-tree failed: $out" ;;
  esac
}

cmd_commits() {
  local d="$1" r sha subj ok where merges
  r="$(remote_ref "$d")"
  merges="$(git rev-list --merges --count "$r..HEAD")"
  echo "MERGES $merges"
  echo "## COMMITS (sha<TAB>type ok|bad<TAB>local|pushed<TAB>subject)"
  while IFS=$'\t' read -r sha subj; do
    [[ -z "$sha" ]] && continue
    if [[ "$subj" =~ $TYPES_RE ]]; then ok=ok; else ok=bad; fi
    if [[ -n "$(git branch -r --contains "$sha" 2>/dev/null)" ]]; then where=pushed; else where=local; fi
    printf '%s\t%s\t%s\t%s\n' "$sha" "$ok" "$where" "$subj"
  done < <(git log --no-merges --reverse --format='%h%x09%s' "$r..HEAD")
}

# numstat as "add<TAB>del<TAB>path" (new path for renames), robust to rename notation.
numstat() {
  git diff --no-ext-diff --numstat -M -z "$1" HEAD | {
    local rec a dl p
    while IFS= read -r -d '' rec; do
      IFS=$'\t' read -r a dl p <<<"$rec"
      if [[ -z "$p" ]]; then
        IFS= read -r -d '' _ || true
        IFS= read -r -d '' p || true
      fi
      printf '%s\t%s\t%s\n' "$a" "$dl" "$p"
    done
  }
}

cmd_context() {
  local d="$1" r base names
  r="$(remote_ref "$d")"
  base="$(git merge-base HEAD "$r")"
  names="$(git diff --no-ext-diff --name-status -M "$base" HEAD)"

  echo "BASE $(git rev-parse --short "$base") (merge-base with $r)"
  [[ -n "$(git status --porcelain --untracked-files=no)" ]] \
    && echo "WARN uncommitted tracked changes are not part of the PR"

  echo
  echo "## COMMITS (@@ sha subject, then files)"
  git log --no-merges --reverse --format='@@ %h %s' --name-only "$base..HEAD"

  echo
  echo "## FILES (status<TAB>package<TAB>+add<TAB>-del<TAB>path)"
  local files=0 lines=0 a dl p st
  while IFS=$'\t' read -r a dl p; do
    st="$(awk -F'\t' -v p="$p" '$NF==p{print substr($1,1,1); exit}' <<<"$names")"
    printf '%s\t%s\t+%s\t-%s\t%s\n' "$st" "$(package_of "$p")" "$a" "$dl" "$p"
    if ! [[ "$p" =~ $NOISE_RE ]]; then
      files=$((files + 1))
      [[ "$a" != - ]] && lines=$((lines + a + dl))
    fi
  done < <(numstat "$base")

  echo
  echo "## SIZE (lockfiles, drizzle meta and snapshots excluded)"
  echo "files=$files lines=$lines"
  if (( files > MAX_FILES || lines > MAX_LINES )); then
    echo "OVER limit (files>$MAX_FILES or lines>$MAX_LINES) — check whether the PR should be split"
  fi

  echo
  echo "## FLAGS"
  local found=0 p1 p2 path
  while IFS=$'\t' read -r st p1 p2; do
    [[ -z "$st" ]] && continue
    path="${p2:-$p1}"
    case "$path" in
      server/src/db/migrations/*.sql)
        [[ "${st:0:1}" == A ]] && { printf 'migration\t%s — add "After pulling: run pnpm db:migrate in server/"\n' "$path"; found=1; } ;;
      .env.example|*/.env.example)
        printf 'env\t%s — existing .env files are not updated automatically\n' "$path"; found=1 ;;
      package.json|*/package.json)
        printf 'deps\t%s — reinstall in that package after pulling\n' "$path"; found=1 ;;
      *.test.ts|*.test.tsx|e2e/flows/*.flow.json)
        printf 'test\t%s %s\n' "${st:0:1}" "$path"; found=1 ;;
    esac
  done <<<"$names"
  if grep -qF $'\tserver/src/vendor/shared/' <<<"$names"; then
    if grep -qF $'\tclient/src/vendor/shared/' <<<"$names"; then
      printf 'contract\tserver/src/vendor/shared changed, client copy changed too\n'
    else
      printf 'contract\tserver/src/vendor/shared changed, client copy NOT mirrored — fix or explain before PR\n'
    fi
    found=1
  fi
  (( found == 0 )) && echo "(none)"
  return 0
}

cmd="${1:-}"
dest="${2:-main}"
case "$cmd" in
  preflight) cmd_preflight "$dest" ;;
  sync) cmd_sync "$dest" ;;
  commits) cmd_commits "$dest" ;;
  context) cmd_context "$dest" ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
