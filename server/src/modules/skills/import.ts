/**
 * Skill import parsing — pure, no I/O. Turns an uploaded/fetched markdown file
 * or archive into a draft the user confirms before anything is saved.
 *
 * Only the markdown core of a skill is used: in an archive that is `SKILL.md`
 * (or the single markdown file); every other entry — scripts, references,
 * assets — is listed back as ignored and never decompressed, written to disk
 * or executed.
 */
import { Unzip, UnzipInflate, unzipSync } from 'fflate';
import { parse as parseYaml } from 'yaml';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { normalizeTags } from './helpers.js';
import { IMPORT_MAX_ARCHIVE_ENTRIES, IMPORT_MAX_FILE_BYTES, SKILL_TAG_MAX, SKILL_TAGS_MAX } from './constants.js';

export type ImportDraft = Omit<SkillImportPreview['draft'], 'source'>;

export interface ParsedSkill {
  draft: ImportDraft;
  warnings: string[];
}

export type ImportFileKind = 'markdown' | 'archive';

const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_NAME_MAX = 64;

function invalid(message: string): ValidationError {
  return new ValidationError(message);
}

/** File kind from a file name / URL path; undefined when unsupported. */
export function kindFromName(name: string): ImportFileKind | undefined {
  const lower = name.toLowerCase().split(/[?#]/)[0]!;
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.zip') || lower.endsWith('.skill')) return 'archive';
  return undefined;
}

/** `github.com/<o>/<r>/blob/<ref>/<path>` → the raw file URL; other URLs unchanged. */
export function toRawGitHubUrl(url: string): string {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url;
}

/** Lowercase kebab slug, max 64 chars ('' when nothing usable is left). */
export function toSkillSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, '');
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    throw invalid('The skill file is not UTF-8 text');
  }
}

/** Split `---\n<yaml>\n---\n<body>`; undefined when the file has no frontmatter. */
export function splitFrontmatter(text: string): { yaml: string; body: string } | undefined {
  const src = text.replace(/\r\n?/g, '\n');
  if (!src.startsWith('---\n')) return undefined;
  const end = src.slice(4).search(/^(---|\.\.\.)[ \t]*$/m);
  if (end < 0) return undefined;
  const yamlEnd = 4 + end;
  const afterFence = src.indexOf('\n', yamlEnd);
  return { yaml: src.slice(4, yamlEnd), body: afterFence < 0 ? '' : src.slice(afterFence + 1) };
}

function asText(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/**
 * Parse a skill markdown file. `name` and `description` are required in the
 * frontmatter; `type` defaults to `custom` (unknown values too, with a
 * warning); `tags` may be a list or a comma-separated string.
 */
export function parseSkillMarkdown(text: string): ParsedSkill {
  const parts = splitFrontmatter(text);
  if (!parts) {
    throw invalid('No YAML frontmatter found — the file must start with a --- block holding name and description');
  }
  let meta: unknown;
  try {
    meta = parseYaml(parts.yaml, { maxAliasCount: 20 });
  } catch (e) {
    throw invalid(`Frontmatter is not valid YAML: ${e instanceof Error ? e.message.split('\n')[0] : 'parse error'}`);
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw invalid('Frontmatter must be a YAML mapping with name and description');
  }
  const fm = meta as Record<string, unknown>;
  const warnings: string[] = [];

  const rawName = asText(fm.name);
  if (!rawName) throw invalid('Frontmatter is missing the required field "name"');
  let name = rawName;
  if (!SKILL_NAME_RE.test(name) || name.length > SKILL_NAME_MAX) {
    name = toSkillSlug(rawName);
    if (!name) throw invalid(`Frontmatter "name" (${rawName.slice(0, 80)}) has no usable characters`);
    warnings.push(`Name "${rawName.slice(0, 80)}" was converted to "${name}" (kebab-case).`);
  }

  const description = asText(fm.description);
  if (!description) throw invalid('Frontmatter is missing the required field "description"');

  let type: SkillType = 'custom';
  if (fm.type !== undefined && fm.type !== null) {
    const parsed = SkillType.safeParse(asText(fm.type)?.toLowerCase());
    if (parsed.success) type = parsed.data;
    else warnings.push(`Unknown type "${String(asText(fm.type) ?? '').slice(0, 40)}" — set to "custom".`);
  }

  let tags: string[] = [];
  const rawTags = fm.tags;
  if (Array.isArray(rawTags)) tags = rawTags.map(asText).filter((x): x is string => !!x);
  else if (typeof rawTags === 'string') tags = rawTags.split(',');
  else if (rawTags !== undefined && rawTags !== null) warnings.push('"tags" must be a list or a comma-separated string — ignored.');
  tags = normalizeTags(tags);
  const tooLong = tags.filter((x) => x.length > SKILL_TAG_MAX);
  if (tooLong.length) warnings.push(`Dropped tags longer than ${SKILL_TAG_MAX} characters: ${tooLong.join(', ')}.`);
  tags = tags.filter((x) => x.length <= SKILL_TAG_MAX);
  if (tags.length > SKILL_TAGS_MAX) {
    warnings.push(`Only the first ${SKILL_TAGS_MAX} tags were kept.`);
    tags = tags.slice(0, SKILL_TAGS_MAX);
  }

  const body = parts.body.trim();
  if (!body) throw invalid('The skill has no body after the frontmatter');

  return { draft: { name, description, type, tags, body }, warnings };
}

/**
 * Pick the skill's markdown out of a zip (`.zip` / `.skill`): `SKILL.md` at the
 * root or one folder down, else the only markdown file there. Only that entry
 * is decompressed; everything else is returned as `ignored`.
 */
export function extractSkillFromArchive(bytes: Uint8Array): { text: string; ignored: string[] } {
  const entries: { name: string; size: number }[] = [];
  try {
    // A filter that returns false lists entries without decompressing them.
    unzipSync(bytes, {
      filter: (f) => {
        if (!f.name.endsWith('/') && !f.name.startsWith('__MACOSX/')) entries.push({ name: f.name, size: f.originalSize });
        if (entries.length > IMPORT_MAX_ARCHIVE_ENTRIES) throw new Error('too many entries');
        return false;
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'too many entries') {
      throw invalid(`The archive has more than ${IMPORT_MAX_ARCHIVE_ENTRIES} files`);
    }
    throw invalid('The file is not a valid zip archive');
  }

  const depth = (n: string) => n.split('/').length - 1;
  const shallowMd = entries.filter((e) => depth(e.name) <= 1 && /\.(md|markdown)$/i.test(e.name));
  const skillMd = shallowMd
    .filter((e) => /(^|\/)skill\.md$/i.test(e.name))
    .sort((a, b) => depth(a.name) - depth(b.name));
  const target = skillMd[0] ?? (shallowMd.length === 1 ? shallowMd[0] : undefined);
  if (!target) {
    throw invalid('No SKILL.md found in the archive (expected at the root or one folder down)');
  }
  const tooLarge = () => invalid(`${target.name} is larger than ${IMPORT_MAX_FILE_BYTES} bytes`);
  // The declared size is a header field the archive's author controls — a fast
  // reject only. `inflateEntryCapped` enforces the real limit while inflating.
  if (target.size > IMPORT_MAX_FILE_BYTES) throw tooLarge();

  let out: Uint8Array | null;
  try {
    out = inflateEntryCapped(bytes, target.name, IMPORT_MAX_FILE_BYTES);
  } catch (e) {
    if (e instanceof InflateLimitError) throw tooLarge();
    throw invalid(`Could not decompress ${target.name}`);
  }
  if (!out) throw invalid(`Could not read ${target.name}`);
  return { text: decodeUtf8(out), ignored: entries.map((e) => e.name).filter((n) => n !== target.name) };
}

class InflateLimitError extends Error {}

/** Compressed bytes fed per step: one step can inflate to at most ~1032× this (deflate's max ratio). */
const INFLATE_FEED_BYTES = 4 * 1024;

/**
 * Decompress one archive entry, aborting as soon as its output passes `cap`
 * bytes — a zip bomb is stopped after at most `cap` + ~4 MB, whatever sizes
 * its headers declare. Returns null when the entry is not found.
 */
export function inflateEntryCapped(bytes: Uint8Array, name: string, cap: number): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let done = false;
  const unzip = new Unzip((file) => {
    if (file.name !== name || done) return;
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      total += chunk.byteLength;
      if (total > cap) throw new InflateLimitError();
      chunks.push(chunk);
      if (final) done = true;
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let off = 0; off < bytes.byteLength && !done; off += INFLATE_FEED_BYTES) {
    const end = Math.min(off + INFLATE_FEED_BYTES, bytes.byteLength);
    unzip.push(bytes.subarray(off, end), end === bytes.byteLength);
  }
  if (!done) return null;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Parse imported bytes of a known kind into a preview draft. */
export function parseImport(bytes: Uint8Array, kind: ImportFileKind): ParsedSkill & { ignored: string[] } {
  if (kind === 'archive') {
    const { text, ignored } = extractSkillFromArchive(bytes);
    return { ...parseSkillMarkdown(text), ignored };
  }
  return { ...parseSkillMarkdown(decodeUtf8(bytes)), ignored: [] };
}
