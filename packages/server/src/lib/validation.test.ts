import { describe, expect, mock, test } from 'bun:test';

// validation.ts imports heavy runtime modules. The functions we test are pure
// validation logic, so mock the side-effect-heavy imports.
void mock.module('../shared/logger', () => ({
  logger: { error: mock(() => {}), warn: mock(() => {}) },
}));
void mock.module('../startDiscord', () => ({
  isValidSourceUrl: mock((url: string) => url.startsWith('https://')),
  isPlaylistUrl: mock((url: string) => url.includes('playlist')),
  getEnabledSourceDisplayNames: mock(() => ['YouTube', 'SoundCloud']),
  getMetadata: mock(() => Promise.resolve({})),
  getPlaylistMetadataWithVideos: mock(() => Promise.resolve({})),
}));

const {
  clampMaxVideos,
  youTubeUrl,
  validateArtworkUrl,
  validateNickname,
  validateOptionalString,
  validatePlaylistName,
  validatePlaylistUrl,
  validateSourceUrl,
  validateTags,
  validateVolumeBoost,
} = await import('./validation');

describe('clampMaxVideos', () => {
  test('returns undefined when input is undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(clampMaxVideos(undefined)).toBeUndefined();
  });

  test('clamps below 1', () => {
    expect(clampMaxVideos(0)).toBe(1);
    expect(clampMaxVideos(-5)).toBe(1);
  });

  test('clamps above 100', () => {
    expect(clampMaxVideos(101)).toBe(100);
    expect(clampMaxVideos(500)).toBe(100);
  });

  test('passes through values in range', () => {
    expect(clampMaxVideos(1)).toBe(1);
    expect(clampMaxVideos(50)).toBe(50);
    expect(clampMaxVideos(100)).toBe(100);
  });
});

describe('youTubeUrl', () => {
  test('builds a canonical YouTube watch URL', () => {
    expect(youTubeUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  test('handles empty string', () => {
    expect(youTubeUrl('')).toBe('https://www.youtube.com/watch?v=');
  });
});

describe('validateSourceUrl', () => {
  test('rejects non-strings', () => {
    expect(() => validateSourceUrl(123)).toThrow();
  });

  test('rejects empty string', () => {
    expect(() => validateSourceUrl('')).toThrow();
  });

  test('rejects null', () => {
    expect(() => validateSourceUrl(null)).toThrow();
  });

  test('rejects sourceUrl that isValidSourceUrl rejects', () => {
    expect(() => validateSourceUrl('ftp://not-https.com/video')).toThrow();
  });

  test('accepts valid HTTPS URL', () => {
    expect(validateSourceUrl('https://youtube.com/watch?v=abc')).toBe(
      'https://youtube.com/watch?v=abc'
    );
  });

  test('trims whitespace', () => {
    expect(validateSourceUrl('  https://youtube.com/watch?v=abc  ')).toBe(
      'https://youtube.com/watch?v=abc'
    );
  });
});

describe('validatePlaylistUrl', () => {
  test('rejects non-strings', () => {
    expect(() => validatePlaylistUrl(456)).toThrow();
  });

  test('rejects URL that isPlaylistUrl rejects', () => {
    expect(() => validatePlaylistUrl('https://youtube.com/watch?v=abc')).toThrow();
  });

  test('accepts URL containing "playlist"', () => {
    expect(validatePlaylistUrl('https://youtube.com/playlist?list=abc')).toBe(
      'https://youtube.com/playlist?list=abc'
    );
  });
});

describe('validatePlaylistName', () => {
  test('rejects non-strings', () => {
    expect(() => validatePlaylistName(123)).toThrow();
  });

  test('rejects empty string', () => {
    expect(() => validatePlaylistName('')).toThrow();
  });

  test('rejects whitespace-only string', () => {
    expect(() => validatePlaylistName('   ')).toThrow();
  });

  test('accepts valid name and trims', () => {
    expect(validatePlaylistName('  My Playlist  ')).toBe('My Playlist');
  });

  test('rejects null', () => {
    expect(() => validatePlaylistName(null)).toThrow();
  });
});

describe('validateNickname', () => {
  test('returns null for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(validateNickname(undefined)).toBeNull();
  });

  test('returns null for null', () => {
    expect(validateNickname(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(validateNickname('')).toBeNull();
  });

  test('returns null for whitespace-only', () => {
    expect(validateNickname('   ')).toBeNull();
  });

  test('trims and returns valid nickname', () => {
    expect(validateNickname('  Cool Song  ')).toBe('Cool Song');
  });

  test('rejects non-string values', () => {
    expect(() => validateNickname(42)).toThrow();
  });
});

describe('validateOptionalString', () => {
  test('returns null for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(validateOptionalString(undefined)).toBeNull();
  });

  test('returns null for null', () => {
    expect(validateOptionalString(null)).toBeNull();
  });

  test('returns null for non-string', () => {
    expect(validateOptionalString(42)).toBeNull();
  });

  test('trims and returns string', () => {
    expect(validateOptionalString('  hello  ')).toBe('hello');
  });

  test('returns null for whitespace-only', () => {
    expect(validateOptionalString('   ')).toBeNull();
  });
});

describe('validateArtworkUrl', () => {
  test('returns null for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(validateArtworkUrl(undefined)).toBeNull();
  });

  test('returns null for null', () => {
    expect(validateArtworkUrl(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(validateArtworkUrl('')).toBeNull();
  });

  test('rejects non-string values', () => {
    expect(() => validateArtworkUrl(123)).toThrow();
  });

  test('accepts and trims valid URL', () => {
    expect(validateArtworkUrl('  https://example.com/art.jpg  ')).toBe(
      'https://example.com/art.jpg'
    );
  });

  test('rejects invalid URL', () => {
    expect(() => validateArtworkUrl('not-a-url')).toThrow();
  });
});

describe('validateTags', () => {
  test('returns empty array for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(validateTags(undefined)).toEqual([]);
  });

  test('returns empty array for null', () => {
    expect(validateTags(null)).toEqual([]);
  });

  test('rejects non-array values', () => {
    expect(() => validateTags('not-an-array')).toThrow();
  });

  test('filters non-strings and empty strings', () => {
    expect(validateTags(['rock', '', 123, '  ', 'jazz'])).toEqual(['rock', 'jazz']);
  });

  test('deduplicates tags', () => {
    expect(validateTags(['rock', 'rock', 'jazz'])).toEqual(['rock', 'jazz']);
  });

  test('replaces spaces with hyphens', () => {
    expect(validateTags(['alt rock', 'drum and bass'])).toEqual(['alt-rock', 'drum-and-bass']);
  });

  test('empty array returns empty', () => {
    expect(validateTags([])).toEqual([]);
  });
});

describe('validateVolumeBoost', () => {
  test('returns undefined for undefined (PATCH skips)', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(validateVolumeBoost(undefined)).toBeUndefined();
  });

  test('returns null for null (explicitly cleared)', () => {
    expect(validateVolumeBoost(null)).toBeNull();
  });

  test('rejects non-integer numbers', () => {
    expect(() => validateVolumeBoost(1.5)).toThrow();
  });

  test('rejects non-numbers', () => {
    expect(() => validateVolumeBoost('loud')).toThrow();
  });

  test('rejects below -100', () => {
    expect(() => validateVolumeBoost(-101)).toThrow();
  });

  test('rejects above 200', () => {
    expect(() => validateVolumeBoost(201)).toThrow();
  });

  test('accepts -100', () => {
    expect(validateVolumeBoost(-100)).toBe(-100);
  });

  test('accepts 0', () => {
    expect(validateVolumeBoost(0)).toBe(0);
  });

  test('accepts 200', () => {
    expect(validateVolumeBoost(200)).toBe(200);
  });
});
