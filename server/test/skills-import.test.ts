import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  extractSkillFromArchive,
  inflateEntryCapped,
  kindFromName,
  parseImport,
  parseSkillMarkdown,
  splitFrontmatter,
  toRawGitHubUrl,
  toSkillSlug,
} from '../src/modules/skills/import.js';
import { checkedLookup, isBlockedAddress } from '../src/adapters/http/index.js';
import { IMPORT_MAX_FILE_BYTES } from '../src/modules/skills/constants.js';
import { SKILL_BODY_MAX } from '@devdigest/shared';

const md = (fm: string, body = '# Rule\nCheck things.') => `---\n${fm}\n---\n${body}\n`;

describe('skill import — frontmatter', () => {
  it('parses name, description, type and tags', () => {
    const r = parseSkillMarkdown(md('name: sec-audit\ndescription: Audit auth\ntype: Security\ntags: [OWASP, auth, owasp]'));
    expect(r.draft).toEqual({
      name: 'sec-audit',
      description: 'Audit auth',
      type: 'security',
      tags: ['owasp', 'auth'],
      body: '# Rule\nCheck things.',
    });
    expect(r.warnings).toEqual([]);
  });

  it('defaults a missing type to custom silently and an unknown one with a warning', () => {
    expect(parseSkillMarkdown(md('name: a\ndescription: d')).draft.type).toBe('custom');
    const r = parseSkillMarkdown(md('name: a\ndescription: d\ntype: linter'));
    expect(r.draft.type).toBe('custom');
    expect(r.warnings[0]).toMatch(/Unknown type "linter"/);
  });

  it('accepts comma-separated tags and converts a non-kebab name with a warning', () => {
    const r = parseSkillMarkdown(md('name: Security Audit\ndescription: d\ntags: "a, B"'));
    expect(r.draft.name).toBe('security-audit');
    expect(r.draft.tags).toEqual(['a', 'b']);
    expect(r.warnings[0]).toMatch(/converted to "security-audit"/);
  });

  it('requires frontmatter, name, description and a body', () => {
    expect(() => parseSkillMarkdown('# no frontmatter')).toThrow(/No YAML frontmatter/);
    expect(() => parseSkillMarkdown(md('description: d'))).toThrow(/"name"/);
    expect(() => parseSkillMarkdown(md('name: a'))).toThrow(/"description"/);
    expect(() => parseSkillMarkdown(md('name: a\ndescription: d', '  '))).toThrow(/no body/);
    expect(() => parseSkillMarkdown(md('name: [a'))).toThrow(/not valid YAML/);
  });

  it('rejects a body longer than SKILL_BODY_MAX', () => {
    expect(() => parseSkillMarkdown(md('name: big\ndescription: d', 'x'.repeat(SKILL_BODY_MAX + 1)))).toThrow(/longer than/);
  });

  it('handles CRLF and a BOM-free split', () => {
    expect(splitFrontmatter('---\r\nname: a\r\n---\r\nbody')).toEqual({ yaml: 'name: a\n', body: 'body' });
  });
});

describe('skill import — archives', () => {
  const zip = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

  it('takes SKILL.md one folder down and lists scripts/references as ignored', () => {
    const bytes = zip({
      'my-skill/SKILL.md': md('name: my-skill\ndescription: d'),
      'my-skill/scripts/run.sh': 'rm -rf /',
      'my-skill/references/extra.md': '# extra',
    });
    const r = parseImport(bytes, 'archive');
    expect(r.draft.name).toBe('my-skill');
    expect(r.ignored.sort()).toEqual(['my-skill/references/extra.md', 'my-skill/scripts/run.sh']);
  });

  it('falls back to the single top-level markdown file', () => {
    expect(extractSkillFromArchive(zip({ 'rule.md': 'x', 'run.py': 'print()' })).text).toBe('x');
  });

  it('rejects archives without a skill markdown and non-zip bytes', () => {
    expect(() => extractSkillFromArchive(zip({ 'a.md': 'x', 'b.md': 'y' }))).toThrow(/No SKILL.md/);
    expect(() => extractSkillFromArchive(zip({ 'deep/er/SKILL.md': 'x' }))).toThrow(/No SKILL.md/);
    expect(() => extractSkillFromArchive(strToU8('not a zip'))).toThrow(/not a valid zip/);
  });

  it('stops inflating a zip bomb whose headers lie about the size', () => {
    const big = 'a'.repeat(IMPORT_MAX_FILE_BYTES + 1024);
    const bytes = zipSync({ 'SKILL.md': strToU8(big) }, { level: 9 });
    expect(bytes.byteLength).toBeLessThan(64 * 1024);
    // Rewrite the declared uncompressed size in the central directory (offset 24) to 100 bytes.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i + 4 <= bytes.byteLength; i++) {
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 100, true);
    }
    expect(() => extractSkillFromArchive(bytes)).toThrow(/larger than/);
  });

  it('inflates an entry under the cap and returns null for a missing one', () => {
    const bytes = zip({ 'SKILL.md': 'hello', 'x.md': 'y' });
    expect(new TextDecoder().decode(inflateEntryCapped(bytes, 'SKILL.md', 100)!)).toBe('hello');
    expect(inflateEntryCapped(bytes, 'nope.md', 100)).toBeNull();
  });
});

describe('skill import — helpers', () => {
  it('kindFromName / toRawGitHubUrl / toSkillSlug', () => {
    expect(kindFromName('X.MD')).toBe('markdown');
    expect(kindFromName('a.skill')).toBe('archive');
    expect(kindFromName('a.sh')).toBeUndefined();
    expect(toRawGitHubUrl('https://github.com/o/r/blob/main/s/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/o/r/main/s/SKILL.md',
    );
    expect(toSkillSlug('  Hello, World!! ')).toBe('hello-world');
  });

  it('blocks loopback, private and link-local addresses', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1',
      '::127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:0:4136:e378::1', 'fe90::1', 'fec0::1', 'ff02::1',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    expect(isBlockedAddress('140.82.112.3')).toBe(false);
    expect(isBlockedAddress('2606:50c0:8000::154')).toBe(false);
  });

  it('refuses a host name that resolves to a blocked address at connect time', async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      checkedLookup('localhost', {}, (e) => resolve(e)),
    );
    expect(err?.code).toBe('E_DEVDIGEST_BLOCKED_ADDRESS');
  });
});
