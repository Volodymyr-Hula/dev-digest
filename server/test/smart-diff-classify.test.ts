import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/helpers.js';

/**
 * Smart diff path → role (spec: specs/smart-diff.md FR-004, FR-005, T-002).
 * Rule sets are evaluated boilerplate → tests → wiring → docs; `core` when none matches.
 * One row per pattern of each role, so dropping or loosening a pattern turns a row red.
 */

const BOILERPLATE: [string, string][] = [
  ['yarn-style .lock suffix', 'a/b.lock'],
  ['pnpm-lock.yaml at the root', 'pnpm-lock.yaml'],
  ['pnpm-lock.yaml in a package', 'client/pnpm-lock.yaml'],
  ['package-lock.json', 'e2e/package-lock.json'],
  ['yarn.lock', 'yarn.lock'],
  ['dist/ segment', 'client/dist/x.js'],
  ['build/ segment', 'server/build/main.js'],
  ['__snapshots__/ segment', '__snapshots__/a.snap'],
  ['.snap suffix', 'src/a.snap'],
  ['.generated. infix', 'src/schema.generated.ts'],
  ['.min.js suffix', 'public/v.min.js'],
];

const TESTS: [string, string][] = [
  ['.test.ts', 'src/a/b.test.ts'],
  ['.test.tsx', 'a/b.test.tsx'],
  ['.it.test.ts', 'server/src/db.it.test.ts'],
  ['.spec.ts', 'src/foo.spec.ts'],
  ['test/ segment', 'server/test/x.ts'],
  ['tests/ segment', 'pkg/tests/x.py'],
  ['__tests__/ segment', 'src/__tests__/helper.ts'],
  ['e2e/ segment', 'e2e/flows/x.json'],
];

const WIRING: [string, string][] = [
  ['index.ts', 'src/index.ts'],
  ['index.js', 'lib/index.js'],
  ['*.config.* (root)', 'vite.config.ts'],
  ['*.config.* (nested)', 'client/next.config.mjs'],
  ['tsconfig*.json', 'tsconfig.base.json'],
  ['.eslintrc*', '.eslintrc.cjs'],
  ['.env*', '.env.example'],
  ['docker-compose*.yml', 'docker-compose.dev.yml'],
  ['.github/ segment', '.github/workflows/x.yml'],
  ['.claude/ segment', '.claude/settings.json'],
];

const DOCS: [string, string][] = [
  ['.md suffix', 'x/y.md'],
  ['docs/ segment', 'docs/a.txt'],
  ['README without extension', 'README'],
  ['README*', 'server/README.rst'],
  ['CHANGELOG*', 'CHANGELOG.md'],
  ['CHANGELOG without extension', 'CHANGELOG'],
  ['LICENSE', 'LICENSE'],
];

const CORE: [string, string][] = [
  // basename has no `.config.` infix, so this is code, not wiring
  ['src/config.ts', 'src/config.ts'],
  ['plain source file', 'src/api/users.ts'],
  ['a non-index barrel name', 'src/indexer.ts'],
  // directory names match as whole segments, not as substrings
  ['latest/ is not test/', 'src/latest/x.ts'],
  ['rebuild/ is not build/', 'src/rebuild/x.ts'],
  ['redocs/ is not docs/', 'src/redocs/x.ts'],
  // matching is case-sensitive
  ['DIST/ upper-case', 'DIST/x.js'],
];

function table(role: SmartDiffRole, rows: [string, string][]) {
  it.each(rows)(`${role}: %s`, (_name, path) => {
    expect(classifyFile(path)).toBe(role);
  });
}

describe('classifyFile', () => {
  describe('boilerplate', () => table('boilerplate', BOILERPLATE));
  describe('tests', () => table('tests', TESTS));
  describe('wiring', () => table('wiring', WIRING));
  describe('docs', () => table('docs', DOCS));
  describe('core (nothing matches)', () => table('core', CORE));

  describe('contested cases — first matching rule set wins (FR-005)', () => {
    it('__tests__/__snapshots__/x.snap → boilerplate', () => {
      // Decision: the snapshot rule sits above the tests rule. A snapshot is generated
      // output even when it lives under a tests directory, so it is skimmed, not reviewed.
      expect(classifyFile('__tests__/__snapshots__/x.snap')).toBe('boilerplate');
    });

    it('.claude/skills/security/SKILL.md → wiring', () => {
      // Decision: `.claude/**` is evaluated above docs. Markdown there drives agent
      // behaviour (it is configuration), so it must not be skimmed as documentation.
      expect(classifyFile('.claude/skills/security/SKILL.md')).toBe('wiring');
    });

    it('e2e/README.md → tests', () => {
      // Decision (kept): `e2e/**` is evaluated above docs, so a README inside the
      // e2e folder stays with the tests it describes instead of moving to docs.
      expect(classifyFile('e2e/README.md')).toBe('tests');
    });

    it('a lock file under a docs folder stays boilerplate; a test file under docs/ stays tests', () => {
      expect(classifyFile('docs/pnpm-lock.yaml')).toBe('boilerplate');
      expect(classifyFile('docs/examples/a.test.ts')).toBe('tests');
    });
  });
});
