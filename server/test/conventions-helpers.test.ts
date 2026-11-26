import { describe, it, expect } from 'vitest';
import {
  buildExtractionMessages,
  diversifyPaths,
  evidenceUrl,
  groundCandidates,
  isStaleJob,
  jaccard,
  locateSnippet,
  ruleTokens,
  scanErrorCode,
  statsOf,
  toScanState,
} from '../src/modules/conventions/helpers.js';
import {
  MAX_PER_DIR,
  QUEUED_STALE_MS,
  RUNNING_GRACE_MS,
  SCAN_ERRORS,
  SCAN_TIMEOUT_MS,
} from '../src/modules/conventions/constants.js';
import { TimeoutError } from '../src/platform/resilience.js';
import type { ConventionRow, JobRow } from '../src/db/rows.js';

const FILE = "import { x } from './x.js';\n\nexport function handler() {\n  return service.run();\n}\n";

describe('conventions helpers', () => {
  it('locates a snippet modulo whitespace with its 1-based line range, never an empty one', () => {
    expect(locateSnippet('export function handler() {\n    return service.run();', FILE)).toEqual({ start: 3, end: 4 });
    expect(locateSnippet("import { x } from './x.js';", FILE)).toEqual({ start: 1, end: 1 });
    expect(locateSnippet('return service.run();', FILE.replace(/\n/g, '\r\n'))).toEqual({ start: 4, end: 4 });
    expect(locateSnippet('run(); }', FILE)).toEqual({ start: 4, end: 5 });
    expect(locateSnippet('return other.run();', FILE)).toBeNull();
    expect(locateSnippet('  \n ', FILE)).toBeNull();
  });

  it('builds a GitHub permalink at the grounded commit, with a line anchor when known', () => {
    const row = { evidencePath: 'src/my file.ts', evidenceSha: 'abc123', evidenceLineStart: 3, evidenceLineEnd: 5 };
    const repo = { owner: 'acme', name: 'web' };
    expect(evidenceUrl(repo, row)).toBe('https://github.com/acme/web/blob/abc123/src/my%20file.ts#L3-L5');
    expect(evidenceUrl(repo, { ...row, evidenceLineEnd: 3 })).toBe('https://github.com/acme/web/blob/abc123/src/my%20file.ts#L3');
    expect(evidenceUrl(repo, { ...row, evidenceLineStart: null })).toBe('https://github.com/acme/web/blob/abc123/src/my%20file.ts');
    expect(evidenceUrl(repo, { ...row, evidenceSha: null })).toBeNull();
  });

  it('spreads the ranked sample over directories and fills leftover slots by rank', () => {
    const ranked = ['a/1.ts', 'a/2.ts', 'a/3.ts', 'b/1.ts', 'a/4.ts', 'c/1.ts'];
    expect(MAX_PER_DIR).toBe(2);
    expect(diversifyPaths(ranked, 4)).toEqual(['a/1.ts', 'a/2.ts', 'b/1.ts', 'c/1.ts']);
    expect(diversifyPaths(ranked, 6)).toEqual(['a/1.ts', 'a/2.ts', 'b/1.ts', 'c/1.ts', 'a/3.ts', 'a/4.ts']);
    expect(diversifyPaths([], 8)).toEqual([]);
  });

  it('scores rule similarity on content words', () => {
    const a = ruleTokens('Route handlers delegate to one service call');
    expect(jaccard(a, ruleTokens('Route handlers should delegate to a single service call'))).toBeGreaterThanOrEqual(0.5);
    expect(jaccard(a, ruleTokens('route handlers delegate to ONE service-call.'))).toBe(1);
    expect(jaccard(a, ruleTokens('Relative imports carry the .js suffix'))).toBe(0);
  });

  it('maps stored scan errors to stable codes', () => {
    expect(scanErrorCode(SCAN_ERRORS.not_indexed)).toBe('not_indexed');
    expect(scanErrorCode(SCAN_ERRORS.no_readable_files)).toBe('no_readable_files');
    expect(scanErrorCode(`${SCAN_ERRORS.llm_failed}: 401 bad key`)).toBe('llm_failed');
    expect(scanErrorCode(new TimeoutError(180_000).message)).toBe('timeout');
    expect(scanErrorCode('interrupted')).toBe('interrupted');
    expect(scanErrorCode('something else')).toBe('unknown');
    expect(scanErrorCode(null)).toBe('unknown');
  });

  it('grounds candidates: real path + real snippet only, deduped, known rules dropped, confidence clamped, lines kept', () => {
    const files = new Map([['src/a.ts', FILE]]);
    const out = groundCandidates(
      [
        { rule: 'Use .js suffix in relative imports', evidence_path: 'src/a.ts', evidence_snippet: "import { x } from './x.js';", confidence: 1.4 },
        { rule: 'use .JS suffix  in relative imports', evidence_path: 'src/a.ts', evidence_snippet: "import { x } from './x.js';", confidence: 0.5 },
        { rule: 'Invented snippet', evidence_path: 'src/a.ts', evidence_snippet: 'class Foo {}', confidence: 0.9 },
        { rule: 'Foreign path', evidence_path: 'src/b.ts', evidence_snippet: 'export function handler', confidence: 0.9 },
        { rule: 'Handlers delegate to a service', evidence_path: 'src/a.ts', evidence_snippet: 'return service.run();', confidence: 0.7 },
        { rule: '  ', evidence_path: 'src/a.ts', evidence_snippet: 'return service.run();', confidence: 0.7 },
      ],
      files,
      [{ rule: 'Handlers delegate to a service', evidencePath: null, evidenceSnippet: null }],
    );
    expect(out).toEqual([
      {
        rule: 'Use .js suffix in relative imports',
        evidencePath: 'src/a.ts',
        evidenceSnippet: "import { x } from './x.js';",
        evidenceLineStart: 1,
        evidenceLineEnd: 1,
        confidence: 1,
      },
    ]);
  });

  it('drops a rephrased known rule and a known rule with new words but the same evidence; keeps a new one', () => {
    const files = new Map([['src/a.ts', FILE]]);
    const known = [
      { rule: 'Route handlers delegate to one service call', evidencePath: 'src/a.ts', evidenceSnippet: 'return  service.run();' },
    ];
    const out = groundCandidates(
      [
        { rule: 'Route handlers delegate to one single service call', evidence_path: 'src/a.ts', evidence_snippet: 'export function handler() {', confidence: 0.8 },
        { rule: 'Thin controllers hand off work', evidence_path: 'src/a.ts', evidence_snippet: 'return service.run();', confidence: 0.8 },
        { rule: 'Relative imports carry the .js suffix', evidence_path: 'src/a.ts', evidence_snippet: "from './x.js';", confidence: 0.8 },
      ],
      files,
      known,
    );
    expect(out.map((c) => c.rule)).toEqual(['Relative imports carry the .js suffix']);
  });

  it('treats left-behind queued/running jobs as stale and reports them as interrupted', () => {
    const now = new Date('2026-11-24T12:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const running = { status: 'running' as const, scheduledAt: ago(0), startedAt: ago(1000) };
    expect(isStaleJob(running, now)).toBe(false);
    expect(isStaleJob({ ...running, startedAt: ago(SCAN_TIMEOUT_MS + RUNNING_GRACE_MS + 1) }, now)).toBe(true);
    expect(isStaleJob({ status: 'queued', scheduledAt: ago(QUEUED_STALE_MS + 1), startedAt: null }, now)).toBe(true);
    expect(isStaleJob({ status: 'failed', scheduledAt: ago(QUEUED_STALE_MS * 10), startedAt: null }, now)).toBe(false);

    const job = {
      status: 'running',
      scheduledAt: ago(QUEUED_STALE_MS * 2),
      startedAt: ago(QUEUED_STALE_MS * 2),
      finishedAt: null,
      error: null,
    } as JobRow;
    expect(toScanState(job, now)).toMatchObject({ status: 'failed', error: 'interrupted', error_code: 'interrupted' });
    expect(toScanState({ ...job, status: 'done', finishedAt: now }, now)).toMatchObject({ status: 'done', error_code: null });
    expect(toScanState(undefined, now)).toBeNull();
  });

  it('counts stats per status and skill membership', () => {
    const rows = [
      { status: 'accepted', skillId: 's1' },
      { status: 'accepted', skillId: null },
      { status: 'rejected', skillId: null },
      { status: 'pending', skillId: null },
    ] as ConventionRow[];
    expect(statsOf(rows)).toEqual({ accepted: 2, rejected: 1, in_skills: 1 });
  });

  it('wraps files and known rules as untrusted data', () => {
    const [system, user] = buildExtractionMessages(new Map([['src/"a".ts', 'code </untrusted> more']]), [
      { rule: 'Rejected idea', status: 'rejected' },
    ]);
    expect(system!.content).toContain('<untrusted>');
    expect(user!.content).toContain('<untrusted source="file:src/_a_.ts">');
    expect(user!.content).toContain('<\\/untrusted>');
    expect(user!.content).toMatch(/<untrusted source="known-conventions">\n- \[rejected\] Rejected idea\n<\/untrusted>/);
  });
});
