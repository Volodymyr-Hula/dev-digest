#!/usr/bin/env bash
# Rewrite local, unpushed commits without an interactive editor.
#
#   rewrite-local.sh <base-ref> <plan-file>
#
# plan-file, one line per commit to change (other commits are kept as they are):
#   <sha><TAB>reword<TAB><new subject>     replace the subject, keep the body
#   <sha><TAB>drop                         remove the commit (only after it was cherry-picked elsewhere)
#
# Refuses when the tree has tracked changes, the range <merge-base>..HEAD has merge commits,
# or a listed commit is outside that range or already on a remote branch.
# Saves the old HEAD as refs/create-pr/backup/<timestamp>-<sha> before rewriting.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

die() { echo "rewrite-local: $*" >&2; exit 1; }

[[ $# -eq 2 ]] || { sed -n '2,12p' "$0"; exit 1; }
base_ref="$1"; plan="$2"
[[ -f "$plan" ]] || die "plan file not found: $plan"

[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "commit or stash tracked changes first"
mb="$(git merge-base HEAD "$base_ref")" || die "no merge-base with $base_ref"
[[ "$(git rev-list --merges --count "$mb..HEAD")" == 0 ]] \
  || die "the range has merge commits; rewriting would flatten them — warn the user instead"

WORK="$(mktemp -d)"
export WORK
trap 'rm -rf "$WORK"' EXIT

n=0
while IFS=$'\t' read -r sha action subj; do
  [[ -z "$sha" ]] && continue
  full="$(git rev-parse --verify -q "$sha^{commit}")" || die "unknown commit $sha"
  git merge-base --is-ancestor "$full" HEAD && ! git merge-base --is-ancestor "$full" "$mb" \
    || die "$sha is not in $mb..HEAD"
  [[ -z "$(git branch -r --contains "$full")" ]] || die "$sha is already on a remote branch; rewriting needs force-push"
  case "$action" in
    reword)
      [[ -n "$subj" ]] || die "empty subject for $sha"
      body="$(git log -1 --format=%b "$full")"
      { printf '%s\n' "$subj"; [[ -n "$body" ]] && printf '\n%s\n' "$body"; } >"$WORK/$full.msg" ;;
    drop) : >"$WORK/$full.drop" ;;
    *) die "unknown action '$action' for $sha (reword|drop)" ;;
  esac
  n=$((n + 1))
done <"$plan"
(( n > 0 )) || die "plan is empty"

cat >"$WORK/seq.sh" <<'SEQ'
#!/usr/bin/env bash
set -euo pipefail
todo="$1"
while IFS= read -r line; do
  if [[ "$line" =~ ^(pick|p)[[:space:]]+([0-9a-f]+)(.*)$ ]]; then
    full="$(git rev-parse "${BASH_REMATCH[2]}")"
    if [[ -f "$WORK/$full.drop" ]]; then
      printf 'drop %s%s\n' "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
      continue
    fi
    printf '%s\n' "$line"
    [[ -f "$WORK/$full.msg" ]] && printf 'exec git commit --amend --only --no-verify --allow-empty -F %q\n' "$WORK/$full.msg"
  else
    printf '%s\n' "$line"
  fi
done <"$todo" >"$todo.new"
mv "$todo.new" "$todo"
SEQ

backup="refs/create-pr/backup/$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
git update-ref "$backup" HEAD
echo "backup: $backup ($(git rev-parse --short HEAD))"

if ! GIT_SEQUENCE_EDITOR="bash $WORK/seq.sh" git rebase -i --no-autosquash "$mb"; then
  trap - EXIT
  die "rebase stopped — resolve, or undo with: git rebase --abort (backup: $backup)"
fi

git log --format='%h %s' "$mb..HEAD"
