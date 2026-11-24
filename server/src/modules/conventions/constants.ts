/** JobRunner kind of a conventions scan. */
export const SCAN_JOB_KIND = 'conventions.scan';

/** How many top-ranked files the selection step chooses from. */
export const SAMPLE_N = 40;

/** Max files the model may pick (and the top-N fallback size). */
export const SELECT_MAX = 8;

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
