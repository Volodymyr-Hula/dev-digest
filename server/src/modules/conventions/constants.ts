/** JobRunner kind of a conventions scan. */
export const SCAN_JOB_KIND = 'conventions.scan';

/** How many top-ranked files `getConventionSamples` returns for code-side selection. */
export const SAMPLE_N = 40;

/** How many files the scan reads and sends to the model. */
export const SELECT_MAX = 8;

/** At most this many selected files share one directory (the rest of the slots go by rank). */
export const MAX_PER_DIR = 2;

/** Per-file character cap for the extraction prompt. */
export const FILE_CHAR_CAP = 12_000;

/** Per-attempt timeout of the scan job (no retries: a retried LLM failure costs again). */
export const SCAN_TIMEOUT_MS = 180_000;

/** A `running` scan older than timeout + this grace is treated as interrupted (e.g. API restart). */
export const RUNNING_GRACE_MS = 30_000;

/** A `queued` scan older than this is treated as interrupted (the queue is shared with indexing). */
export const QUEUED_STALE_MS = 10 * 60_000;

/** Error text reported for a scan whose job row was left behind. */
export const INTERRUPTED_ERROR = 'interrupted';

/**
 * Messages the scan fails with. `toScanState` maps a stored `jobs.error` back to
 * a stable `error_code` by these prefixes, so keep them unique.
 */
export const SCAN_ERRORS = {
  not_indexed: 'Repo is not indexed yet — no files to sample',
  no_readable_files: 'None of the sampled files could be read',
  llm_failed: 'Model call failed',
} as const;

/** `TimeoutError` message prefix (`platform/resilience.ts`). */
export const TIMEOUT_ERROR_PREFIX = 'Operation timed out';

/** Rule-token Jaccard similarity at or above which a candidate repeats a known rule. */
export const RULE_SIMILARITY = 0.8;
