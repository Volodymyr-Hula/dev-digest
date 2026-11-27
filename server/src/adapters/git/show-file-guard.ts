/**
 * Input validation for `GitClient.showFile(repo, ref, path)` (`git show <ref>:<path>`).
 * Shared by the real adapter and the mock so both reject the same inputs, and
 * always BEFORE any git process is spawned.
 */

/** A 7–40 char hex sha, or the local ref `fetchPullHead` creates (`pr-<n>`). */
const REF_PATTERN = /^(?:[0-9a-f]{7,40}|pr-\d+)$/;

export function assertShowFileArgs(ref: string, path: string): void {
  if (!REF_PATTERN.test(ref)) {
    throw new Error(`Invalid git ref for showFile: ${JSON.stringify(ref)}`);
  }
  if (
    path.length === 0 ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path.startsWith('-') ||
    /^[A-Za-z]:/.test(path) ||
    path.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`Invalid path for showFile: ${JSON.stringify(path)}`);
  }
}
