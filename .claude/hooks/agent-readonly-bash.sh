#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) for subagents: read-only commands, plus opt-in check commands.
# Usage in agent frontmatter:  .../agent-readonly-bash.sh [extra]...   (extra: depcruise | checks | e2e)
# stdin: hook JSON, the command is .tool_input.command. Exit 0 = allow, exit 2 = block (reason on stderr).
#
# Rules (see the subagents plan, Phase 0.1):
#   - reject command substitution ($( ` <( >( ) and any `>` except 2>/dev/null, >/dev/null, 2>&1
#   - split on && || ; | & newline (quote-aware), check each segment's first word against an allowlist
#   - base allowlist: git (read-only subcommands), rg, ls cat head tail wc sort uniq cut diff
#   - extra allowlist from the arguments:
#       depcruise -> server/node_modules/.bin/depcruise
#       checks    -> exactly these typecheck/test forms (no other pnpm/npm subcommand, no npx/node/tsx):
#                      pnpm -C <server|client> typecheck | test
#                      pnpm -C <server|client> exec vitest run [args]
#                      npm --prefix <reviewer-core|e2e> run typecheck
#                      npm --prefix reviewer-core test [-- args]
#                    vitest args may not write files or change mode (-u, --update, --outputFile, --reporter,
#                    -c/--config, --coverage, --watch, --ui, --api, --inspect*, --dir, --root, -r)
#       e2e       -> scripts/e2e.sh (no arguments, no env prefix)
# Fails closed: no jq, unparsable JSON, unbalanced quotes -> block.
set -uo pipefail

EXTRAS=("$@")

deny() { echo "agent-readonly-bash: blocked: $*" >&2; exit 2; }

command -v jq >/dev/null 2>&1 || deny "jq is required by this hook but was not found"

input="$(cat)"
cmd="$(jq -er '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || deny "could not read .tool_input.command from the hook input"
[[ -z "$cmd" ]] && exit 0

# --- 1. whole-string rejects -------------------------------------------------
case "$cmd" in
  *'$('*)  deny 'command substitution $( ) is not allowed' ;;
  *'`'*)   deny 'backtick command substitution is not allowed' ;;
  *'<('*)  deny 'process substitution <( ) is not allowed' ;;
  *'>('*)  deny 'process substitution >( ) is not allowed' ;;
esac

# Drop the three allowed redirect forms, then no `>` may remain.
sanitized="$(sed -E 's#2>&1##g; s#2>[[:space:]]*/dev/null##g; s#>[[:space:]]*/dev/null##g' <<<"$cmd")"
[[ "$sanitized" == *'>'* ]] && deny 'output redirection is not allowed (only 2>/dev/null, >/dev/null, 2>&1)'

# --- 2. per-command checks ---------------------------------------------------
DEPCRUISE_BIN="server/node_modules/.bin/depcruise"

is_extra() {
  local e
  for e in "${EXTRAS[@]+"${EXTRAS[@]}"}"; do [[ "$e" == "$1" ]] && return 0; done
  return 1
}

# vitest arguments allowed after `vitest run` / `test --`: test paths, -t <name>, --exclude <glob>, and
# harmless flags. Anything that writes files, loads another config or changes the run mode is refused.
check_vitest_args() {
  local a
  for a in "$@"; do
    case "$a" in
      -u|--update|--update=*|--outputFile|--outputFile=*|--outputFile.*|--reporter|--reporter=*|-c|--config|--config=*|\
      --coverage|--coverage=*|--coverage.*|--watch|--watch=*|-w|--ui|--api|--api=*|--api.*|--inspect*|\
      --dir|--dir=*|--root|--root=*|-r|--globalSetup*|--setupFiles*|--environment*|--dom|--browser*)
        deny "vitest option '$a' is not allowed" ;;
    esac
  done
}

check_pnpm() {
  is_extra checks || deny "pnpm is not enabled for this agent"
  [[ "${1-}" == "-C" ]] || deny "pnpm must be called as 'pnpm -C <server|client> …'"
  case "${2-}" in server|client) ;; *) deny "pnpm -C '${2-}' is not allowed (server or client)" ;; esac
  case "${3-}" in
    typecheck|test)
      (($# == 3)) || deny "'pnpm -C $2 $3' takes no extra arguments (use 'pnpm -C $2 exec vitest run …')" ;;
    exec)
      [[ "${4-}" == vitest && "${5-}" == run ]] || deny "only 'pnpm -C $2 exec vitest run …' is allowed"
      check_vitest_args "${@:6}" ;;
    *) deny "pnpm subcommand '${3-}' is not allowed (typecheck, test, exec vitest run)" ;;
  esac
}

check_npm() {
  is_extra checks || deny "npm is not enabled for this agent"
  [[ "${1-}" == "--prefix" ]] || deny "npm must be called as 'npm --prefix <reviewer-core|e2e> …'"
  case "${2-}" in reviewer-core|e2e) ;; *) deny "npm --prefix '${2-}' is not allowed (reviewer-core or e2e)" ;; esac
  if [[ "${3-}" == run && "${4-}" == typecheck && $# == 4 ]]; then return 0; fi
  if [[ "$2" == reviewer-core && "${3-}" == test ]]; then
    (($# == 3)) && return 0
    [[ "${4-}" == "--" ]] || deny "pass vitest arguments after '--': 'npm --prefix reviewer-core test -- …'"
    check_vitest_args "${@:5}"
    return 0
  fi
  deny "npm command not allowed (npm --prefix <reviewer-core|e2e> run typecheck, npm --prefix reviewer-core test [-- args])"
}

# args: the words of one segment (quotes already removed)
check_segment() {
  local first="$1"; shift
  local -a args=("$@")
  local a n

  # pnpm/npm only as bare PATH commands: `./pnpm` would run a file from the repo.
  case "$first" in
    pnpm) check_pnpm "$@"; return 0 ;;
    npm) check_npm "$@"; return 0 ;;
  esac

  first="${first#./}"

  case "$first" in
    pnpm|npm) deny "'./$first' must be called as a bare command, not a path" ;;
    scripts/e2e.sh)
      is_extra e2e || deny "scripts/e2e.sh is not enabled for this agent"
      (($# == 0)) || deny "scripts/e2e.sh takes no arguments"
      return 0 ;;
  esac

  if [[ "$first" == "$DEPCRUISE_BIN" ]]; then
    is_extra depcruise || deny "depcruise is not enabled for this agent"
    for a in "${args[@]+"${args[@]}"}"; do
      case "$a" in
        -f|-f*|--output-to|--output-to=*|--cache|--cache=*|--cache-strategy|--cache-strategy=*|--baseline|--baseline=*|--init|--init=*)
          deny "depcruise option '$a' is not allowed" ;;
      esac
    done
    return 0
  fi

  case "$first" in
    git)
      local sub="${args[0]-}"
      case "$sub" in
        diff|log|show|status|blame|ls-files|grep|rev-parse|merge-base|diff-tree) ;;
        *) deny "git '${sub}' is not allowed (allowed: diff log show status blame ls-files grep rev-parse merge-base diff-tree)" ;;
      esac
      for a in "${args[@]:1}"; do
        case "$a" in
          -c|--output|--output=*|--ext-diff|--open-files-in-pager|--open-files-in-pager=*|-O*|--exec|--exec=*)
            deny "git option '$a' is not allowed" ;;
        esac
      done
      ;;
    rg)
      for a in "${args[@]+"${args[@]}"}"; do
        case "$a" in
          --pre|--pre=*|--hostname-bin|--hostname-bin=*) deny "rg option '$a' is not allowed" ;;
        esac
      done
      ;;
    ls|cat|head|wc|cut|diff) ;;
    tail)
      for a in "${args[@]+"${args[@]}"}"; do
        case "$a" in
          -f|-F|--follow|--follow=*) deny "tail follow mode is not allowed" ;;
        esac
      done
      ;;
    sort)
      # -o / --output write a file; --compress-program runs a program.
      for a in "${args[@]+"${args[@]}"}"; do
        case "$a" in
          --output|--output=*|--compress-program|--compress-program=*) deny "sort option '$a' is not allowed" ;;
          --*) ;;
          -*o*) deny "sort option '$a' is not allowed (-o writes a file)" ;;
        esac
      done
      ;;
    uniq)
      # `uniq INPUT OUTPUT` writes OUTPUT: allow at most one non-numeric positional.
      n=0
      for a in "${args[@]+"${args[@]}"}"; do
        [[ "$a" == -* || "$a" =~ ^[0-9]+$ ]] && continue
        n=$((n + 1))
      done
      ((n > 1)) && deny "uniq with an output operand is not allowed"
      ;;
    *)
      local ok=1 e
      for e in "${EXTRAS[@]+"${EXTRAS[@]}"}"; do
        [[ "$e" != depcruise && "$e" != checks && "$e" != e2e && "$first" == "$e" ]] && ok=0
      done
      ((ok == 0)) || deny "command '$first' is not on the read-only allowlist"
      ;;
  esac
  return 0
}

# --- 3. quote-aware split into segments and words -----------------------------
words=()
cur=""
have=0
inS=0
inD=0

flush_word() {
  if ((have)); then words+=("$cur"); fi
  cur=""
  have=0
}
flush_segment() {
  flush_word
  if ((${#words[@]} > 0)); then
    check_segment "${words[@]}"
  fi
  words=()
}

len=${#sanitized}
i=0
while ((i < len)); do
  c="${sanitized:i:1}"
  if ((inS)); then
    if [[ "$c" == "'" ]]; then inS=0; else cur+="$c"; fi
  elif ((inD)); then
    if [[ "$c" == '"' ]]; then
      inD=0
    elif [[ "$c" == '\' ]]; then
      i=$((i + 1)); cur+="${sanitized:i:1}"
    else
      cur+="$c"
    fi
  else
    case "$c" in
      "'") inS=1; have=1 ;;
      '"') inD=1; have=1 ;;
      '\') i=$((i + 1)); cur+="${sanitized:i:1}"; have=1 ;;
      ' '|$'\t') flush_word ;;
      ';'|'|'|'&'|$'\n') flush_segment ;;
      *) cur+="$c"; have=1 ;;
    esac
  fi
  i=$((i + 1))
done

((inS || inD)) && deny "unbalanced quotes"
flush_segment
exit 0
