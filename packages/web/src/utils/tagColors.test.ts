import { describe, expect, test } from 'bun:test';

import { TAG_COLORS, getTagColorClasses } from './tagColors';

describe('getTagColorClasses', () => {
  test('same tag always returns the same color', () => {
    const a = getTagColorClasses('rock');
    const b = getTagColorClasses('rock');
    expect(a.name).toBe(b.name);
  });

  test('is case-insensitive', () => {
    const lower = getTagColorClasses('rock');
    const upper = getTagColorClasses('ROCK');
    expect(lower.name).toBe(upper.name);
  });

  test('different tags may return different colors', () => {
    // With 5 colors and many possible hash values, two different tags
    // could collide. But we can at least check that the result is valid.
    const a = getTagColorClasses('rock');
    const b = getTagColorClasses('jazz');
    expect(TAG_COLORS.some((c) => c.name === a.name)).toBe(true);
    expect(TAG_COLORS.some((c) => c.name === b.name)).toBe(true);
  });

  test('returns a valid color object with bg, text, and border', () => {
    const result = getTagColorClasses('ambient');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('bg');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('border');
    expect(typeof result.bg).toBe('string');
    expect(typeof result.text).toBe('string');
    expect(typeof result.border).toBe('string');
  });

  test('explicit color match returns that color', () => {
    const result = getTagColorClasses('anything', 'violet');
    expect(result.name).toBe('violet');
  });

  test('explicit color is case-sensitive — must match exactly', () => {
    const explicitResult = getTagColorClasses('anything', 'Violet');
    // 'Violet' doesn't match 'violet', so falls back to hash —
    // should produce the same result as no explicit color at all.
    const hashFallback = getTagColorClasses('anything');
    expect(explicitResult.name).toBe(hashFallback.name);
  });

  test('nonexistent explicit color falls back to hash', () => {
    const result = getTagColorClasses('rock', 'chartreuse');
    // 'chartreuse' is not in TAG_COLORS, so falls back to hash for 'rock'
    const hashResult = getTagColorClasses('rock');
    expect(result.name).toBe(hashResult.name);
  });

  test('explicit null falls back to hash', () => {
    const result = getTagColorClasses('rock', null);
    const hashResult = getTagColorClasses('rock');
    expect(result.name).toBe(hashResult.name);
  });

  test('explicit undefined falls back to hash', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const result = getTagColorClasses('rock', undefined);
    const hashResult = getTagColorClasses('rock');
    expect(result.name).toBe(hashResult.name);
  });

  test('empty string tag returns a valid color', () => {
    const result = getTagColorClasses('');
    expect(TAG_COLORS.some((c) => c.name === result.name)).toBe(true);
  });
});

describe('TAG_COLORS', () => {
  test('has exactly 5 colors', () => {
    expect(TAG_COLORS).toHaveLength(5);
  });

  test('all colors have unique names', () => {
    const names = TAG_COLORS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every color has bg, text, and border strings', () => {
    for (const color of TAG_COLORS) {
      expect(typeof color.bg).toBe('string');
      expect(typeof color.text).toBe('string');
      expect(typeof color.border).toBe('string');
      expect(color.bg.length).toBeGreaterThan(0);
      expect(color.text.length).toBeGreaterThan(0);
      expect(color.border.length).toBeGreaterThan(0);
    }
  });

  test('known color names are present', () => {
    const names = TAG_COLORS.map((c) => c.name);
    expect(names).toContain('orange');
    expect(names).toContain('sky');
    expect(names).toContain('emerald');
    expect(names).toContain('amber');
    expect(names).toContain('violet');
  });
});

describe('djb2 hash (via getTagColorClasses determinism)', () => {
  test('known tags map to stable colors (snapshot test)', () => {
    // These mappings are determined by the djb2 hash of the lowercased tag.
    // If djb2 ever changes, these tests will break — which is intentional.
    expect(getTagColorClasses('rock').name).toBe('orange');
    expect(getTagColorClasses('jazz').name).toBe('emerald');
    expect(getTagColorClasses('electronic').name).toBe('amber');
    expect(getTagColorClasses('ambient').name).toBe('violet');
    expect(getTagColorClasses('hip-hop').name).toBe('amber');
    expect(getTagColorClasses('classical').name).toBe('violet');
    expect(getTagColorClasses('pop').name).toBe('amber');
    expect(getTagColorClasses('metal').name).toBe('violet');
  });
});
