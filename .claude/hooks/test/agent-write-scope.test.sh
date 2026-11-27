#!/usr/bin/env bash
# Table tests for .claude/hooks/agent-write-scope.sh. Run as a file:
#   bash .claude/hooks/test/agent-write-scope.test.sh
# Builds a throwaway project dir and points CLAUDE_PROJECT_DIR at it.
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/agent-write-scope.sh"
pass=0
fail=0

PROJ="$(mktemp -d)"
OUTSIDE="$(mktemp -d)"
trap 'rm -rf "$PROJ" "$OUTSIDE"' EXIT
export CLAUDE_PROJECT_DIR="$PROJ"

mkdir -p "$PROJ/server/src/modules/x" "$PROJ/server/test/helpers" "$PROJ/client/src/components/a" \
  "$PROJ/client/src/test" "$PROJ/reviewer-core/src" "$PROJ/reviewer-core/test" "$PROJ/e2e/flows" "$PROJ/e2e/specs" \
  "$PROJ/docs/agent-prompts" "$PROJ/server/docs" "$PROJ/client/docs" "$PROJ/reviewer-core/docs" "$PROJ/e2e/docs" \
  "$PROJ/server/src/dir.ts"
ln -s "$OUTSIDE" "$PROJ/server/src/linked"
ln -s "$OUTSIDE" "$PROJ/server/test/linked"
ln -s "$OUTSIDE" "$PROJ/server/docs/linked"
printf 'x\n' >"$OUTSIDE/t.ts"
ln -s "$OUTSIDE/t.ts" "$PROJ/server/src/file-link.ts"

# t <expected exit> <profile> <file_path>
t() {
  local want="$1" prof="$2" p="$3" got
  jq -n --arg p "$p" '{tool_input:{file_path:$p}}' | bash "$HOOK" "$prof" >/dev/null 2>&1
  got=$?
  if [[ "$got" == "$want" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL (want %s got %s): %s [%s]\n' "$want" "$got" "$prof" "$p"
  fi
}

# ======================= implementer =======================
I() { t "$1" implementer "$2"; }
I 0 "server/src/modules/x/service.ts"
I 0 "$PROJ/server/src/modules/x/routes.ts"
I 0 "client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx"
I 0 "client/src/vendor/shared/contracts.ts"
I 0 "server/src/vendor/shared/contracts.ts"
I 0 "server/src/db/schema/reviews.ts"
I 0 "reviewer-core/src/run.ts"
I 0 "e2e/run.ts"
I 0 "e2e/lib/assert.ts"
I 0 "scripts/dev.sh"
I 0 ".github/workflows/client.yml"
I 0 "client/messages/en.json"
I 0 "server/src/adapters/mocks.ts"
I 0 "README.md"
I 0 "server/src/latest.ts"
# tests
I 2 "server/test/price-book.test.ts"
I 2 "server/test/helpers/app.ts"
I 2 "server/test/skills.it.test.ts"
I 2 "reviewer-core/test/run.test.ts"
I 2 "client/src/components/a/A.test.tsx"
I 2 "client/src/lib/format.test.ts"
I 2 "client/src/test/setup.ts"
I 2 "client/src/components/a/__snapshots__/A.test.tsx.snap"
I 2 "e2e/flows/09-new.flow.json"
I 2 "e2e/specs/coverage.md"
# protected / out of scope
I 2 "server/src/db/migrations/0007_x.sql"
I 2 "server/src/db/migrations/meta/_journal.json"
I 2 "server/package.json"
I 2 "client/package.json"
I 2 "server/pnpm-lock.yaml"
I 2 "reviewer-core/package-lock.json"
I 2 "pnpm-workspace.yaml"
I 2 "docs/agent-prompts/README.md"
I 2 "server/docs/architecture.md"
I 2 "specs/x.md"
I 2 "server/specs/x.md"
I 2 ".claude/agents/implementer.md"
I 2 ".claude/hooks/agent-write-scope.sh"
I 2 ".cursor/skills/x.md"
I 2 ".git/config"
I 2 "INSIGHTS.md"
I 2 "server/INSIGHTS.md"
I 2 "CLAUDE.md"
I 2 "client/CLAUDE.md"
I 2 "server/.env"
I 2 "server/.env.example"
I 2 ".env"
I 2 "server/clones/repo/src/a.ts"
I 2 "server/node_modules/x/index.js"

# ======================= test-writer =======================
T() { t "$1" test-writer "$2"; }
T 0 "server/test/price-book.test.ts"
T 0 "server/test/new-thing.it.test.ts"
T 0 "server/test/helpers/app.ts"
T 0 "server/test/fixtures/sample.diff"
T 0 "$PROJ/reviewer-core/test/run.test.ts"
T 0 "client/src/components/a/A.test.tsx"
T 0 "client/src/lib/format.test.ts"
T 0 "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx"
T 0 "client/src/components/a/__snapshots__/A.test.tsx.snap"
T 0 "client/src/test/findings.ts"
T 0 "client/src/test/intl.tsx"
T 0 "e2e/flows/09-new-journey.flow.json"
T 0 "e2e/specs/coverage.md"
T 0 "e2e/specs/seed-fixtures.md"
T 2 "server/src/modules/x/service.ts"
T 2 "server/src/adapters/mocks.ts"
T 2 "server/src/db/seed.ts"
T 2 "client/src/components/a/A.tsx"
T 2 "client/src/vitest.setup.ts"
T 2 "client/vitest.config.ts"
T 2 "server/vitest.config.ts"
T 2 "reviewer-core/src/run.ts"
T 2 "e2e/run.ts"
T 2 "e2e/lib/assert.ts"
T 2 "e2e/flows/9-x.flow.json"
T 2 "e2e/flows/09-x.json"
T 2 "e2e/flows/09-X.flow.json"
T 2 "e2e/flows/sub/09-x.flow.json"
T 2 "e2e/specs/flow-format.md"
T 2 "server/test/helpers/run.sh"
T 2 "server/package.json"
T 2 "client/test/x.test.ts"
T 2 "docs/x.md"
T 2 "server/test/linked/x.test.ts"
T 2 "e2e/test/x.test.ts"

# ======================= doc-writer =======================
D() { t "$1" doc-writer "$2"; }
D 0 "server/docs/architecture.md"
D 0 "$PROJ/client/docs/ui-architecture.md"
D 0 "reviewer-core/docs/pipeline.md"
D 0 "e2e/docs/architecture.md"
D 0 "docs/new-guide.md"
D 0 "server/docs/sub/topic.md"
D 2 "docs/agent-prompts/README.md"
D 2 "docs/agent-prompts/general-reviewer.md"
D 2 "docs/agent-prompts"
D 2 "README.md"
D 2 "TESTING.md"
D 2 "CLAUDE.md"
D 2 "server/CLAUDE.md"
D 2 "server/INSIGHTS.md"
D 2 "server/README.md"
D 2 "e2e/specs/coverage.md"
D 2 "specs/x.md"
D 2 "server/docs/architecture.txt"
D 2 "server/docs/diagram.svg"
D 2 "server/docs/.hidden.md"
D 2 "server/src/docs/x.md"
D 2 "other/docs/x.md"
D 2 "server/docs/linked/x.md"

# ======================= common rules =======================
for p in implementer test-writer doc-writer; do
  t 2 "$p" "../outside.ts"
  t 2 "$p" "server/../server/test/x.test.ts"
  t 2 "$p" "server/./docs/x.md"
  t 2 "$p" "/etc/passwd"
  t 2 "$p" "$OUTSIDE/t.ts"
  t 2 "$p" "${PROJ}-sibling/server/test/x.test.ts"
  t 2 "$p" ""
done
I 2 "server/src/linked/x.ts"
I 2 "server/src/file-link.ts"
I 2 "server/src/dir.ts"
I 0 "server//src//modules/x/a.ts"
I 0 "./server/src/a.ts"

# git worktree under .claude/worktrees/<name>/ -> re-rooted, same rules inside
WT="$PROJ/.claude/worktrees/wt1"
mkdir -p "$WT/server/src" "$WT/server/test" "$PROJ/.claude/worktrees/notwt/server/src" "$PROJ/.claude/worktrees/dirgit/.git"
printf 'gitdir: /x/.git/worktrees/wt1\n' >"$WT/.git"
printf 'not a worktree\n' >"$PROJ/.claude/worktrees/notwt/.git"
ln -s "$WT" "$PROJ/.claude/worktrees/wtlink"
ln -s "$OUTSIDE" "$WT/server/src/linked"
I 0 ".claude/worktrees/wt1/server/src/a.ts"
I 0 "$WT/client/src/vendor/shared/contracts/brief.ts"
I 2 ".claude/worktrees/wt1/server/test/a.test.ts"
I 2 ".claude/worktrees/wt1/.claude/hooks/x.sh"
I 2 ".claude/worktrees/wt1/.git/config"
I 2 ".claude/worktrees/wt1/server/src/db/migrations/0001_x.sql"
I 2 ".claude/worktrees/wt1/server/src/linked/x.ts"
I 2 ".claude/worktrees/notwt/server/src/a.ts"
I 2 ".claude/worktrees/dirgit/server/src/a.ts"
I 2 ".claude/worktrees/missing/server/src/a.ts"
I 2 ".claude/worktrees/wtlink/server/src/a.ts"
I 2 ".claude/worktrees/wt1/../wt1/server/src/a.ts"
I 2 ".claude/agents/x.md"
t 0 test-writer ".claude/worktrees/wt1/server/test/a.test.ts"
t 2 test-writer ".claude/worktrees/wt1/server/src/a.ts"
t 0 doc-writer ".claude/worktrees/wt1/server/docs/a.md"

# unknown / missing profile
t 2 "" "server/src/a.ts"
t 2 "admin" "server/src/a.ts"

# NotebookEdit input field
jq -n '{tool_input:{notebook_path:"server/src/a.ipynb"}}' | bash "$HOOK" implementer >/dev/null 2>&1
[[ $? == 0 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: notebook_path should be read"; }
jq -n '{tool_input:{notebook_path:"docs/agent-prompts/a.ipynb"}}' | bash "$HOOK" doc-writer >/dev/null 2>&1
[[ $? == 2 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: notebook_path outside scope should block"; }

# fail closed
printf '{"tool_input":{}}' | bash "$HOOK" implementer >/dev/null 2>&1
[[ $? == 2 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: missing file_path should block"; }
printf 'not json' | bash "$HOOK" implementer >/dev/null 2>&1
[[ $? == 2 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: invalid JSON should block"; }

echo "agent-write-scope: $pass passed, $fail failed"
[[ "$fail" == 0 ]]
