/** Schema / tool name of the classifier call (also the `MockLLMProvider` fixture key). */
export const INTENT_SCHEMA_NAME = 'IntentClassification';

/** Input caps for the classifier (a capped source is marked `truncated`). */
export const INPUT_CAPS = {
  title: 300,
  description: 4000,
  issueBody: 3000,
  issues: 3,
  doc: 8000,
  docs: 3,
  commits: 30,
  commitLine: 200,
  paths: 100,
} as const;

/** Caps applied to the parsed classifier output. */
export const OUTPUT_CAPS = {
  summary: 600,
  rationale: 1000,
  scopeItems: 8,
  scopeItemChars: 200,
} as const;

/** A description needs this many meaningful chars to lift confidence to `medium`. */
export const MEANINGFUL_DESCRIPTION_CHARS = 80;

/** Most chars of one linked plan/spec doc echoed into the reviewer prompt. */
export const PROMPT_DOC_EXCERPT_CHARS = 2500;

/** Retry budget of the classifier's structured call. */
export const CLASSIFIER_MAX_RETRIES = 1;

/** Per-call timeout of the classifier. */
export const CLASSIFIER_TIMEOUT_MS = 60_000;

/** Longest failure reason stored on the intent `agent_runs` row. */
export const MAX_RUN_ERROR_CHARS = 500;

/** Closing keywords GitHub recognises (`closes #N`, `fixed owner/repo#N`, …). */
export const CLOSING_KEYWORD_PATTERN = 'close[sd]?|fix(?:e[sd])?|resolve[sd]?';
