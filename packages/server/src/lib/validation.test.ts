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
void mock.module('./json', () => ({
  json: mock((data: unknown, status: number) => new Response(JSON.stringify(data), { status })),
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
    const result = validateSourceUrl(123);
    expect(result.ok).toBe(false);
  });

  test('rejects empty string', () => {
    const result = validateSourceUrl('');
    expect(result.ok).toBe(false);
  });

  test('rejects null', () => {
    const result = validateSourceUrl(null);
    expect(result.ok).toBe(false);
  });

  test('rejects sourceUrl that isValidSourceUrl rejects', () => {
    const result = validateSourceUrl('ftp://not-https.com/video');
    expect(result.ok).toBe(false);
  });

  test('accepts valid HTTPS URL', () => {
    const result = validateSourceUrl('https://youtube.com/watch?v=abc');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('https://youtube.com/watch?v=abc');
    }
  });

  test('trims whitespace', () => {
    const result = validateSourceUrl('  https://youtube.com/watch?v=abc  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('https://youtube.com/watch?v=abc');
    }
  });
});

describe('validatePlaylistUrl', () => {
  test('rejects non-strings', () => {
    const result = validatePlaylistUrl(456);
    expect(result.ok).toBe(false);
  });

  test('rejects URL that isPlaylistUrl rejects', () => {
    const result = validatePlaylistUrl('https://youtube.com/watch?v=abc');
    expect(result.ok).toBe(false);
  });

  test('accepts URL containing "playlist"', () => {
    const result = validatePlaylistUrl('https://youtube.com/playlist?list=abc');
    expect(result.ok).toBe(true);
  });
});

describe('validatePlaylistName', () => {
  test('rejects non-strings', () => {
    const result = validatePlaylistName(123);
    expect(result.ok).toBe(false);
  });

  test('rejects empty string', () => {
    const result = validatePlaylistName('');
    expect(result.ok).toBe(false);
  });

  test('rejects whitespace-only string', () => {
    const result = validatePlaylistName('   ');
    expect(result.ok).toBe(false);
  });

  test('accepts valid name and trims', () => {
    const result = validatePlaylistName('  My Playlist  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('My Playlist');
    }
  });

  test('rejects null', () => {
    const result = validatePlaylistName(null);
    expect(result.ok).toBe(false);
  });
});

describe('validateNickname', () => {
  test('returns null for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const result = validateNickname(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('returns null for null', () => {
    const result = validateNickname(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('returns null for empty string', () => {
    const result = validateNickname('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('returns null for whitespace-only', () => {
    const result = validateNickname('   ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('trims and returns valid nickname', () => {
    const result = validateNickname('  Cool Song  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('Cool Song');
    }
  });

  test('rejects non-string values', () => {
    const result = validateNickname(42);
    expect(result.ok).toBe(false);
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
    const result = validateArtworkUrl(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('returns null for null', () => {
    const result = validateArtworkUrl(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('returns null for empty string', () => {
    const result = validateArtworkUrl('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('rejects non-string values', () => {
    const result = validateArtworkUrl(123);
    expect(result.ok).toBe(false);
  });

  test('accepts and trims valid URL', () => {
    const result = validateArtworkUrl('  https://example.com/art.jpg  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('https://example.com/art.jpg');
    }
  });

  test('rejects invalid URL', () => {
    const result = validateArtworkUrl('not-a-url');
    expect(result.ok).toBe(false);
  });
});

describe('validateTags', () => {
  test('returns empty array for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const result = validateTags(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  test('returns empty array for null', () => {
    const result = validateTags(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  test('rejects non-array values', () => {
    const result = validateTags('not-an-array');
    expect(result.ok).toBe(false);
  });

  test('filters non-strings and empty strings', () => {
    const result = validateTags(['rock', '', 123, '  ', 'jazz']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['rock', 'jazz']);
    }
  });

  test('deduplicates tags', () => {
    const result = validateTags(['rock', 'rock', 'jazz']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['rock', 'jazz']);
    }
  });

  test('replaces spaces with hyphens', () => {
    const result = validateTags(['alt rock', 'drum and bass']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['alt-rock', 'drum-and-bass']);
    }
  });

  test('empty array returns empty', () => {
    const result = validateTags([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

describe('validateVolumeBoost', () => {
  test('returns undefined for undefined (PATCH skips)', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    const result = validateVolumeBoost(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  test('returns null for null (explicitly cleared)', () => {
    const result = validateVolumeBoost(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  test('rejects non-integer numbers', () => {
    const result = validateVolumeBoost(1.5);
    expect(result.ok).toBe(false);
  });

  test('rejects non-numbers', () => {
    const result = validateVolumeBoost('loud');
    expect(result.ok).toBe(false);
  });

  test('rejects below -100', () => {
    const result = validateVolumeBoost(-101);
    expect(result.ok).toBe(false);
  });

  test('rejects above 200', () => {
    const result = validateVolumeBoost(201);
    expect(result.ok).toBe(false);
  });

  test('accepts -100', () => {
    const result = validateVolumeBoost(-100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-100);
    }
  });

  test('accepts 0', () => {
    const result = validateVolumeBoost(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test('accepts 200', () => {
    const result = validateVolumeBoost(200);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(200);
    }
  });
});
