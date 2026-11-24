import { describe, it, expect } from 'vitest';
import {
  buildExtractionMessages,
  groundCandidates,
  isStaleJob,
  pickPaths,
  snippetInFile,
  statsOf,
  toScanState,
} from '../src/modules/conventions/helpers.js';
import {
  QUEUED_STALE_MS,
  RUNNING_GRACE_MS,
  SCAN_TIMEOUT_MS,
  SELECT_MAX,
} from '../src/modules/conventions/constants.js';
import type { ConventionRow, JobRow } from '../src/db/rows.js';

const FILE = "import { x } from './x.js';\n\nexport function handler() {\n  return service.run();\n}\n";

describe('conventions helpers', () => {
  it('matches a snippet modulo whitespace, never an empty one', () => {
    expect(snippetInFile('export function handler() {\n    return service.run();', FILE)).toBe(true);
    expect(snippetInFile('return other.run();', FILE)).toBe(false);
    expect(snippetInFile('  \n ', FILE)).toBe(false);
  });

  it('grounds candidates: real path + real snippet only, deduped, known rules dropped, confidence clamped', () => {
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
      ['Handlers delegate to a service'],
    );
    expect(out).toEqual([
      {
        rule: 'Use .js suffix in relative imports',
        evidencePath: 'src/a.ts',
        evidenceSnippet: "import { x } from './x.js';",
        confidence: 1,
      },
    ]);
  });

  it('keeps only offered paths, capped, and falls back to the top of the list', () => {
    const offered = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    expect(pickPaths(['f3.ts', 'nope.ts', 'f3.ts', 'f1.ts'], offered)).toEqual(['f3.ts', 'f1.ts']);
    expect(pickPaths(offered, offered)).toHaveLength(SELECT_MAX);
    expect(pickPaths(['nope.ts'], offered)).toEqual(offered.slice(0, SELECT_MAX));
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
    expect(toScanState(job, now)).toMatchObject({ status: 'failed', error: 'interrupted' });
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
