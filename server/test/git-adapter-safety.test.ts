import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient, UnsafeClonePathError } from '../src/adapters/git/simple-git.js';

/**
 * S1 (security hardening) — the adapter's own line of defence:
 * clone paths stay inside cloneDir, and the GitHub token never lands in a
 * clone's `.git/config`.
 */

const GIT = 'git';
const run = (cwd: string, ...args: string[]) =>
  execFileSync(GIT, args, { cwd, stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    .toString()
    .trim();

let work: string;
let cloneDir: string;
let upstream: string;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'dd-git-safety-'));
  cloneDir = join(work, 'clones');
  upstream = join(work, 'upstream');
  await mkdir(upstream);
  run(upstream, 'init', '-q', '-b', 'main');
  run(upstream, 'config', 'user.email', 't@example.com');
  run(upstream, 'config', 'user.name', 't');
  await writeFile(join(upstream, 'README.md'), 'hello\n');
  run(upstream, 'add', '.');
  run(upstream, 'commit', '-q', '-m', 'init');
});

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('SimpleGitClient.clonePathFor', () => {
  const client = () => new SimpleGitClient('/tmp/dd-clones');

  it('maps owner/name under cloneDir', () => {
    expect(client().clonePathFor({ owner: 'acme', name: 'widgets' })).toBe('/tmp/dd-clones/acme/widgets');
  });

  it.each([
    { owner: '..', name: 'node_modules' },
    { owner: 'acme', name: '..' },
    { owner: '.', name: 'x' },
    { owner: 'a/b', name: 'c' },
    { owner: 'acme', name: '../../etc' },
    { owner: '', name: 'x' },
    { owner: 'acme', name: 'x\0y' },
  ])('throws for %o before touching the filesystem', (ref) => {
    expect(() => client().clonePathFor(ref)).toThrow(UnsafeClonePathError);
  });
});

describe('SimpleGitClient.clone', () => {
  it('clones with a token configured, without writing the token into .git/config', async () => {
    const token = 'ghp_TESTTOKENSHOULDNEVERPERSIST';
    const client = new SimpleGitClient(cloneDir, { getToken: async () => token });
    const { path } = await client.clone({ owner: 'acme', name: 'widgets' }, upstream, { depth: 1 });

    expect(path).toBe(join(cloneDir, 'acme', 'widgets'));
    expect(await readFile(join(path, 'README.md'), 'utf8')).toBe('hello\n');
    const config = await readFile(join(path, '.git', 'config'), 'utf8');
    expect(config).not.toContain(token);
    expect(config).not.toContain('extraHeader');
    expect(config).not.toContain('Authorization');
  });

  it('scrubs a PAT left in origin by a pre-S1 clone on the next fetch', async () => {
    const dest = join(cloneDir, 'legacy', 'repo');
    await mkdir(join(cloneDir, 'legacy'), { recursive: true });
    run(work, 'clone', '-q', upstream, dest);
    run(dest, 'remote', 'set-url', 'origin', 'https://x-access-token:ghp_OLD@github.com/legacy/repo.git');

    const client = new SimpleGitClient(cloneDir);
    // The fetch itself targets github.com and fails offline / without the
    // repo — the scrub must already have happened before that.
    await client.clone({ owner: 'legacy', name: 'repo' }, 'unused').catch(() => undefined);

    expect(run(dest, 'remote', 'get-url', 'origin')).toBe('https://github.com/legacy/repo.git');
  });

  it('never removes anything outside cloneDir for a traversal ref', async () => {
    const sentinel = join(work, 'sentinel');
    await mkdir(sentinel);
    const client = new SimpleGitClient(cloneDir);
    await expect(client.clone({ owner: '..', name: 'sentinel' }, upstream)).rejects.toThrow(UnsafeClonePathError);
    await expect(access(sentinel)).resolves.toBeUndefined();
  });
});

/**
 * SC-010 / FR-043 — `showFile(repo, ref, path)` runs `git show <ref>:<path>`.
 * Hostile path/ref are refused BEFORE git starts: the repo below was never
 * cloned, so if git were spawned the error would be a git/ENOENT one, not our
 * own "Invalid …" message.
 */
describe('SimpleGitClient.showFile', () => {
  const SHA = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
  const neverCloned = { owner: 'never', name: 'cloned' };

  it.each([
    ['../secret.md', 'a ".." segment'],
    ['docs/../../secret.md', 'a nested ".." segment'],
    ['/etc/passwd', 'an absolute path'],
    ['-o.md', 'a leading "-"'],
    ['docs/a\0.md', 'a NUL byte'],
    ['', 'an empty path'],
  ])('rejects path %j (%s) before spawning git', async (path) => {
    const client = new SimpleGitClient(cloneDir);
    await expect(client.showFile(neverCloned, SHA, path)).rejects.toThrow(/Invalid path/);
  });

  it.each(['HEAD;rm', 'HEAD', 'main', '--output=x', 'abc12', 'pr-', 'pr-1x', `${SHA}0`, '../x'])(
    'rejects ref %j before spawning git',
    async (ref) => {
      const client = new SimpleGitClient(cloneDir);
      await expect(client.showFile(neverCloned, ref, 'README.md')).rejects.toThrow(/Invalid git ref/);
    },
  );

  it('lets a valid sha / pr-N ref and a plain path through to git (control: fails as git, not as validation)', async () => {
    const client = new SimpleGitClient(cloneDir);
    for (const ref of [SHA, 'abcdef1', 'pr-482']) {
      const err = await client.showFile(neverCloned, ref, 'docs/plan.md').catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toMatch(/Invalid (path|git ref)/);
    }
  });

  it('returns the committed content for a valid sha and path, not the working-tree copy', async () => {
    const sha = run(upstream, 'rev-parse', 'HEAD');
    const client = new SimpleGitClient(cloneDir);
    const repo = { owner: 'acme', name: 'show-file' };
    const { path } = await client.clone(repo, upstream);

    await writeFile(join(path, 'README.md'), 'edited in the working tree\n');
    expect(await client.showFile(repo, sha, 'README.md')).toBe('hello\n');
    expect(await client.showFile(repo, sha.slice(0, 7), 'README.md')).toBe('hello\n');
  });

  it('fails (does not return stale content) when the path is absent at that sha', async () => {
    const sha = run(upstream, 'rev-parse', 'HEAD');
    const client = new SimpleGitClient(cloneDir);
    await expect(client.showFile({ owner: 'acme', name: 'show-file' }, sha, 'nope/missing.md')).rejects.toThrow();
  });
});
