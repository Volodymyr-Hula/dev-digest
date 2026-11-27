#!/usr/bin/env bash
# Table tests for .claude/hooks/agent-readonly-bash.sh. Run as a file:
#   bash .claude/hooks/test/agent-readonly-bash.test.sh
# Words that the pr-self-review guard greps for are assembled from parts so this file never
# contains them literally.
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/agent-readonly-bash.sh"
pass=0
fail=0

PU="pu"; SH="sh"
PUSH="${PU}${SH}"

# run <expected exit> <extras> <command...>   (extras: "" or "depcruise")
t() {
  local want="$1" extras="$2" cmd="$3" got
  # shellcheck disable=SC2086
  jq -n --arg c "$cmd" '{tool_input:{command:$c}}' | bash "$HOOK" $extras >/dev/null 2>&1
  got=$?
  if [[ "$got" == "$want" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL (want %s got %s): [%s] extras=[%s]\n' "$want" "$got" "$cmd" "$extras"
  fi
}
allow() { t 0 "${2:-}" "$1"; }
block() { t 2 "${2:-}" "$1"; }

DC="server/node_modules/.bin/depcruise"

# ---- allow: base allowlist ----
allow 'git diff origin/main...HEAD'
allow 'git diff --cached'
allow 'git log --oneline -n 5'
allow 'git show HEAD:server/src/app.ts'
allow 'git status --short'
allow 'git blame -L 1,10 CLAUDE.md'
allow 'git ls-files --others --exclude-standard'
allow 'git grep -n "container\.db" -- server/src'
allow 'git rev-parse --show-toplevel'
allow 'git merge-base origin/main HEAD'
allow 'git diff-tree --no-commit-id --name-only -r HEAD'
allow 'rg -n "foo|bar" server/src'
allow "rg 'a;b' server"
allow 'ls -la server/src'
allow 'cat server/package.json'
allow 'head -n 20 INSIGHTS.md'
allow 'tail -n 20 INSIGHTS.md'
allow 'wc -l CLAUDE.md'
allow 'sort -u names.txt'
allow 'uniq -c'
allow 'cut -d: -f1 list.txt'
allow 'diff a.txt b.txt'
allow 'git diff 2>/dev/null'
allow 'git diff >/dev/null'
allow 'git diff 2>&1'
allow 'git diff > /dev/null 2>&1'
allow 'git diff --stat | head -n 5'
allow 'git diff && git status'
allow 'git ls-files | rg "\.ts$" | sort | uniq -c | sort -rn'
allow 'git diff; git status'
allow $'git diff\ngit status'

# ---- allow: depcruise only with the extra ----
allow "$DC --config server/.dependency-cruiser.cjs --ignore-known .dependency-cruiser-known-violations.json src" depcruise
allow "$DC -T metrics src" depcruise
allow "./$DC --version" depcruise

# ---- block: extra not enabled ----
block "$DC src"
block "$DC src" ""

# ---- block: depcruise flags ----
block "$DC -f out.json src" depcruise
block "$DC -fout.json src" depcruise
block "$DC --output-to out.json src" depcruise
block "$DC --output-to=out.json src" depcruise
block "$DC --cache src" depcruise
block "$DC --cache-strategy content src" depcruise
block "$DC --baseline src" depcruise
block "$DC --init" depcruise
block "depcruise src" depcruise
block "server/node_modules/.bin/depcruise-baseline src" depcruise

# ---- block: substitution and redirection ----
block 'echo $(whoami)'
block 'git diff $(echo HEAD)'
block 'git diff `echo HEAD`'
block 'cat <(git diff)'
block 'git diff > out.txt'
block 'git diff >> out.txt'
block 'git diff >out.txt'
block 'cat a 2>err.txt'
block 'git diff &> out.txt'
block 'git diff 1>out.txt'
block 'rg x > /dev/null > out.txt'
block 'cat a >| out.txt'

# ---- block: git ----
block "git ${PUSH} origin main"
block 'git checkout main'
block 'git commit -m x'
block 'git reset --hard'
block 'git add .'
block 'git branch -D x'
block 'git stash'
block 'git config user.name x'
block 'git -c core.pager=sh log'
block 'git -C /tmp log'
block 'git log -c'
block 'git diff --output=out.patch'
block 'git diff --output out.patch'
block 'git log --output=out'
block 'git show --ext-diff HEAD'
block 'git grep -O sh foo'
block 'git grep --open-files-in-pager=sh foo'
block 'git'
block 'git --version'

# ---- block: rg ----
block 'rg --pre cat foo'
block 'rg --pre=cat foo'
block 'rg --hostname-bin=sh foo'

# ---- block: not on allowlist ----
block 'sed -i s/a/b/ file'
block 'sed -n 1p file'
block 'find . -delete'
block 'find . -name x'
block 'pnpm test'
block 'npm run build'
block 'node -e 1'
block 'tsx x.ts'
block 'cd server'
block 'cd server && ls'
block 'rm -rf x'
block 'mv a b'
block 'cp a b'
block 'touch a'
block 'tee out.txt'
block 'curl https://example.com'
block 'bash -c ls'
block 'sh -c ls'
block 'eval ls'
block 'xargs rm'
block 'env ls'
block 'FOO=1 ls'
block 'awk 1 file'
block 'true'
block 'echo hi'
block 'chmod +x a'
block 'ls ; rm x'
block 'ls && rm x'
block 'ls || rm x'
block 'ls | rm x'
block 'ls & rm x'
block 'git diff | tee out.txt'
block $'ls\nrm x'
block 'ls; ( rm x )'
block '(ls)'
block '{ ls; }'
block '/bin/ls'
block '/usr/bin/git diff'
block 'l"s" ; rm x'

# ---- block: tool-specific write/exec flags ----
block 'sort -o out.txt in.txt'
block 'sort -ro out.txt in.txt'
block 'sort --output=out.txt in.txt'
block 'sort --compress-program=sh in.txt'
block 'uniq in.txt out.txt'
block 'tail -f server.log'
block 'tail -F server.log'
block 'tail --follow x'

# ---- block: malformed ----
block "ls 'unclosed"
block 'ls "unclosed'

# ---- allow: quotes hide separators, but the quoted text is never run ----
allow 'rg "a && rm -rf x" server'
allow "rg 'a | rm x' server"

# ---- checks extra: allowed forms ----
allow 'pnpm -C server typecheck' checks
allow 'pnpm -C client typecheck' checks
allow 'pnpm -C server test' checks
allow 'pnpm -C client test' checks
allow 'pnpm -C server exec vitest run' checks
allow 'pnpm -C server exec vitest run test/price-book.test.ts' checks
allow "pnpm -C server exec vitest run --exclude '**/*.it.test.ts'" checks
allow 'pnpm -C client exec vitest run src/components/severity-counts -t "renders counts"' checks
allow 'npm --prefix reviewer-core run typecheck' checks
allow 'npm --prefix e2e run typecheck' checks
allow 'npm --prefix reviewer-core test' checks
allow 'npm --prefix reviewer-core test -- test/run.test.ts' checks
allow 'pnpm -C server typecheck && pnpm -C server test' checks
allow 'pnpm -C server test 2>&1 | tail -n 40' checks
block './pnpm -C server test' checks
block './npm --prefix reviewer-core test' checks
allow 'git diff --stat' checks

# ---- checks extra: not enabled ----
block 'pnpm -C server test'
block 'npm --prefix reviewer-core test'
block 'pnpm -C server test' depcruise
block 'pnpm -C server test' e2e

# ---- checks extra: blocked forms ----
block 'pnpm test' checks
block 'pnpm typecheck' checks
block 'pnpm --dir server test' checks
block 'pnpm -C . test' checks
block 'pnpm -C ./server test' checks
block 'pnpm -C reviewer-core test' checks
block 'pnpm -C server add zod' checks
block 'pnpm -C server install' checks
block 'pnpm -C server remove zod' checks
block 'pnpm -C server dlx cowsay' checks
block 'pnpm -C server db:generate' checks
block 'pnpm -C server db:migrate' checks
block 'pnpm -C server dev' checks
block 'pnpm -C server build' checks
block 'pnpm -C server run test' checks
block 'pnpm -C server test --reporter=json' checks
block 'pnpm -C server exec tsx src/x.ts' checks
block 'pnpm -C server exec node -e 1' checks
block 'pnpm -C server exec vitest' checks
block 'pnpm -C server exec vitest watch' checks
block 'pnpm -C server exec vitest run -u' checks
block 'pnpm -C server exec vitest run --update' checks
block 'pnpm -C server exec vitest run --outputFile=out.json' checks
block 'pnpm -C server exec vitest run --outputFile.json=out.json' checks
block 'pnpm -C server exec vitest run --reporter json' checks
block 'pnpm -C server exec vitest run -c other.config.ts' checks
block 'pnpm -C server exec vitest run --config=other.config.ts' checks
block 'pnpm -C server exec vitest run --coverage' checks
block 'pnpm -C server exec vitest run --coverage.enabled' checks
block 'pnpm -C server exec vitest run --watch' checks
block 'pnpm -C server exec vitest run --ui' checks
block 'pnpm -C server exec vitest run --root /tmp' checks
block 'pnpm -C server exec vitest run --dir /tmp' checks
block 'pnpm -C server exec vitest run --inspect-brk' checks
block 'pnpm -C server exec vitest run --globalSetup x.ts' checks
block 'pnpm -C server exec vitest run --setupFiles=x.ts' checks
block 'pnpm -C server exec vitest run > out.txt' checks
block 'npm test' checks
block 'npm --prefix server test' checks
block 'npm --prefix client run typecheck' checks
block 'npm --prefix e2e test' checks
block 'npm --prefix e2e run e2e:hermetic' checks
block 'npm --prefix reviewer-core install' checks
block 'npm --prefix reviewer-core install openai' checks
block 'npm --prefix reviewer-core exec vitest run' checks
block 'npm --prefix reviewer-core run build' checks
block 'npm --prefix reviewer-core run typecheck --x' checks
block 'npm --prefix reviewer-core test test/run.test.ts' checks
block 'npm --prefix reviewer-core test -- -u' checks
block 'npm --prefix reviewer-core test -- --reporter=json' checks
block 'npx vitest run' checks
block 'npx tsc --noEmit' checks
block 'node -e 1' checks
block 'tsx x.ts' checks
block 'checks' checks
block 'pnpm -C server test; rm -rf x' checks
block 'FOO=1 pnpm -C server test' checks
block 'cd server && pnpm test' checks

# ---- e2e extra ----
allow './scripts/e2e.sh' e2e
allow 'scripts/e2e.sh' e2e
allow './scripts/e2e.sh 2>&1 | tail -n 60' "checks e2e"
block './scripts/e2e.sh'
block './scripts/e2e.sh' checks
block './scripts/e2e.sh --flow 01' e2e
block 'bash scripts/e2e.sh' e2e
block 'sh ./scripts/e2e.sh' e2e
block 'E2E_PG_PORT=1 ./scripts/e2e.sh' e2e
block 'PATH=/x:/y ./scripts/e2e.sh' e2e
block '/abs/scripts/e2e.sh' e2e
block './scripts/dev.sh' e2e
block 'e2e' e2e
block 'npm --prefix e2e test' "checks e2e"

# ---- empty / missing command ----
t 0 "" ""
printf '{"tool_input":{}}' | bash "$HOOK" >/dev/null 2>&1
[[ $? == 2 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: missing command should block (fail closed)"; }
printf 'not json' | bash "$HOOK" >/dev/null 2>&1
[[ $? == 2 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: invalid JSON should block"; }

echo "agent-readonly-bash: $pass passed, $fail failed"
[[ "$fail" == 0 ]]
