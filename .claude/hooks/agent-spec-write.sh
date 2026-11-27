#!/usr/bin/env bash
# PreToolUse hook (matcher: Write|Edit) for the planner agent.
# stdin: hook JSON, the target is .tool_input.file_path. Exit 0 = allow, exit 2 = block (reason on stderr).
#
# Allows only a new or already planner-owned `<slug>.md` directly inside
#   specs/                                  (root, cross-module)
#   {server,client,reviewer-core,e2e}/specs/
# Blocks: `..` or `.` segments, symlinks (file or any parent), non-.md, any other location, paths outside
# $CLAUDE_PROJECT_DIR, and existing files whose first line is not `<!-- planner-spec -->`.
set -uo pipefail

MARKER='<!-- planner-spec -->'

deny() { echo "agent-spec-write: blocked: $*" >&2; exit 2; }

command -v jq >/dev/null 2>&1 || deny "jq is required by this hook but was not found"

input="$(cat)"
path="$(jq -er '.tool_input.file_path // empty' <<<"$input" 2>/dev/null)" || deny "could not read .tool_input.file_path"
[[ -z "$path" ]] && deny "empty file_path"

proj_raw="${CLAUDE_PROJECT_DIR:-$PWD}"
proj="$(cd "$proj_raw" 2>/dev/null && pwd -P)" || deny "cannot resolve project dir '$proj_raw'"

# Squeeze duplicate slashes, then reject dot segments before any further processing.
path="$(sed -E 's#/+#/#g' <<<"$path")"
if [[ "$path" =~ (^|/)\.\.(/|$) ]]; then deny "'..' segments are not allowed"; fi

if [[ "$path" == /* ]]; then
  case "$path" in
    "$proj"/*) rel="${path#"$proj"/}" ;;
    "${proj_raw%/}"/*) rel="${path#"${proj_raw%/}"/}" ;;
    *) deny "path is outside the project directory" ;;
  esac
else
  rel="${path#./}"
fi
if [[ "$rel" =~ (^|/)\.(/|$) ]]; then deny "'.' segments are not allowed"; fi

re='^(specs|(server|client|reviewer-core|e2e)/specs)/[A-Za-z0-9][A-Za-z0-9_-]*\.md$'
[[ "$rel" =~ $re ]] || deny "'$rel' is not an allowed spec location (specs/<slug>.md or {server,client,reviewer-core,e2e}/specs/<slug>.md, .md only)"

# Symlink check on every existing component, from the first segment down to the file.
walk=""
IFS='/' read -r -a parts <<<"$rel"
for part in "${parts[@]}"; do
  walk="${walk:+$walk/}$part"
  [[ -L "$proj/$walk" ]] && deny "'$walk' is a symlink"
done

full="$proj/$rel"
if [[ -e "$full" ]]; then
  [[ -f "$full" ]] || deny "'$rel' exists and is not a regular file"
  first="$(head -n 1 "$full" | tr -d '\r')"
  [[ "$first" == "$MARKER" ]] || deny "'$rel' exists and is not a planner file (first line must be $MARKER); refusing to overwrite it"
fi
exit 0
