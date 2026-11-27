#!/usr/bin/env bash
# Table tests for .claude/hooks/agent-spec-write.sh. Run as a file:
#   bash .claude/hooks/test/agent-spec-write.test.sh
# Builds a throwaway project dir and points CLAUDE_PROJECT_DIR at it.
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/agent-spec-write.sh"
pass=0
fail=0

PROJ="$(mktemp -d)"
OUTSIDE="$(mktemp -d)"
trap 'rm -rf "$PROJ" "$OUTSIDE"' EXIT
export CLAUDE_PROJECT_DIR="$PROJ"

mkdir -p "$PROJ/specs" "$PROJ/server/specs" "$PROJ/client/specs" "$PROJ/reviewer-core/specs" "$PROJ/e2e/specs" "$PROJ/other/specs" "$PROJ/server/src"
printf '<!-- planner-spec -->\n# mine\n' >"$PROJ/specs/own.md"
printf '<!-- planner-spec -->\r\n# crlf\n' >"$PROJ/server/specs/own-crlf.md"
printf '# As-built spec\n' >"$PROJ/server/specs/pr-import.md"
printf '\n<!-- planner-spec -->\n' >"$PROJ/server/specs/blank-first.md"
printf ' <!-- planner-spec -->\n' >"$PROJ/server/specs/indented.md"
: >"$PROJ/server/specs/empty.md"
printf 'x\n' >"$OUTSIDE/target.md"
ln -s "$OUTSIDE/target.md" "$PROJ/specs/link.md"
ln -s "$OUTSIDE" "$PROJ/client/specs/linkdir"
ln -s "$OUTSIDE" "$PROJ/e2e/linked-parent"
rm -rf "$PROJ/reviewer-core/specs"
ln -s "$OUTSIDE" "$PROJ/reviewer-core/specs"
mkdir "$PROJ/specs/dir.md"

# t <expected exit> <file_path>
t() {
  local want="$1" p="$2" got
  jq -n --arg p "$p" '{tool_input:{file_path:$p}}' | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [[ "$got" == "$want" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL (want %s got %s): [%s]\n' "$want" "$got" "$p"
  fi
}
allow() { t 0 "$1"; }
block() { t 2 "$1"; }

# ---- allow: new files in each location, relative and absolute ----
allow "specs/new-feature.md"
allow "server/specs/new-thing.md"
allow "client/specs/new-thing.md"
allow "e2e/specs/new-thing.md"
allow "./specs/new-feature.md"
allow "$PROJ/specs/new-feature.md"
allow "$PROJ/server/specs/new-thing.md"
allow "$PROJ/client/specs//double-slash.md"
allow "specs/Slug_2-b.md"

# ---- allow: existing planner-owned files ----
allow "specs/own.md"
allow "$PROJ/specs/own.md"
allow "server/specs/own-crlf.md"

# ---- block: existing foreign files ----
block "server/specs/pr-import.md"
block "$PROJ/server/specs/pr-import.md"
block "server/specs/blank-first.md"
block "server/specs/indented.md"
block "server/specs/empty.md"
block "specs/dir.md"

# ---- block: traversal ----
block "specs/../server/specs/pr-import.md"
block "../outside.md"
block "specs/../../outside.md"
block "$PROJ/specs/../CLAUDE.md"
block "server/specs/../src/x.md"
block "specs/./x.md"
block "./specs/./x.md"

# ---- block: symlinks ----
block "specs/link.md"
block "client/specs/linkdir/new.md"
block "reviewer-core/specs/new.md"
block "$PROJ/client/specs/linkdir/new.md"

# ---- block: wrong extension ----
block "specs/new.txt"
block "specs/new"
block "specs/new.md.bak"
block "specs/new.markdown"
block "specs/.md"
block "specs/.hidden.md"
block "specs/a.b.md"
block "specs/new.MD"

# ---- block: wrong location ----
block "CLAUDE.md"
block "INSIGHTS.md"
block "server/INSIGHTS.md"
block "server/CLAUDE.md"
block "server/src/x.md"
block "server/specs/sub/x.md"
block "specs/sub/x.md"
block "other/specs/x.md"
block "docs/x.md"
block ".claude/agents/planner.md"
block ".claude/hooks/agent-spec-write.sh"
block "server/specs.md"
block "myspecs/x.md"
block "server/myspecs/x.md"
block "x/server/specs/x.md"
block "specs/"
block "specs"
block "server/specs"
block "/specs/x.md"
block "/etc/passwd"
block "$OUTSIDE/target.md"
block "${PROJ}-sibling/specs/x.md"
block "~/specs/x.md"
block "specs/x y.md"
block "specs/x;y.md"

# ---- block: empty / missing / invalid ----
block ""
printf '{"tool_input":{}}' | bash "$HOOK" >/dev/null 2>&1
[[ $? == 2 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: missing file_path should block"; }
printf 'not json' | bash "$HOOK" >/dev/null 2>&1
[[ $? == 2 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: invalid JSON should block"; }

echo "agent-spec-write: $pass passed, $fail failed"
[[ "$fail" == 0 ]]
