import { describe, it, expect } from 'vitest';
import {
  defaultTrusted,
  isSkillConfigChange,
  normalizeTags,
} from '../src/modules/skills/helpers.js';

describe('normalizeTags', () => {
  it('trims, lowercases, dedupes and drops empties, keeping first-seen order', () => {
    expect(normalizeTags([' Security ', 'owasp', 'SECURITY', '', '  '])).toEqual([
      'security',
      'owasp',
    ]);
  });
});

describe('defaultTrusted', () => {
  it('trusts manual/extracted skills, not imported or community ones', () => {
    expect(defaultTrusted('manual')).toBe(true);
    expect(defaultTrusted('extracted')).toBe(true);
    expect(defaultTrusted('imported_url')).toBe(false);
    expect(defaultTrusted('community')).toBe(false);
  });
});

describe('isSkillConfigChange', () => {
  const existing = {
    name: 'a',
    description: 'd',
    type: 'rubric' as const,
    body: 'b',
    tags: ['x', 'y'],
    trusted: true,
  };

  it('is false for an empty patch or same values', () => {
    expect(isSkillConfigChange(existing, {})).toBe(false);
    expect(isSkillConfigChange(existing, { name: 'a', tags: ['x', 'y'], trusted: true })).toBe(
      false,
    );
  });

  it('is true when any versioned field changes', () => {
    expect(isSkillConfigChange(existing, { body: 'c' })).toBe(true);
    expect(isSkillConfigChange(existing, { tags: ['y', 'x'] })).toBe(true);
    expect(isSkillConfigChange(existing, { trusted: false })).toBe(true);
    expect(isSkillConfigChange(existing, { type: 'security' })).toBe(true);
  });
});
