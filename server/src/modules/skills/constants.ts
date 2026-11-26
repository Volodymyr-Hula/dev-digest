/** Version number recorded for a freshly created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Import limits: one markdown file / archive (bytes), and archive entry count. */
export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ARCHIVE_ENTRIES = 500;
export const IMPORT_FETCH_TIMEOUT_MS = 10_000;
/** JSON body cap for POST /skills/import/preview (base64 of a max-size file + slack). */
export const IMPORT_BODY_LIMIT = Math.ceil((IMPORT_MAX_FILE_BYTES * 4) / 3) + 64 * 1024;

/** Mirrors `SkillTag` (max 32) and `CreateSkillInput.tags` (max 20). */
export const SKILL_TAG_MAX = 32;
export const SKILL_TAGS_MAX = 20;
