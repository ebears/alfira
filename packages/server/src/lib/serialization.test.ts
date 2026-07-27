import { describe, expect, test } from 'bun:test';

import { formatSong, type SerializedSong } from './serialization';

describe('formatSong', () => {
  test('passes through createdAt unchanged', () => {
    const result = formatSong({ createdAt: '2024-06-15T12:00:00.000Z' });
    expect(result.createdAt).toBe('2024-06-15T12:00:00.000Z');
  });

  test('defaults tags to empty array when null', () => {
    const result = formatSong({ createdAt: '2024-01-01T00:00:00.000Z', tags: null });
    expect(result.tags).toEqual([]);
  });

  test('defaults tags to empty array when undefined', () => {
    const result = formatSong({ createdAt: '2024-01-01T00:00:00.000Z' });
    expect(result.tags).toEqual([]);
  });

  test('preserves existing tags', () => {
    const result = formatSong({
      createdAt: '2024-01-01T00:00:00.000Z',
      tags: ['rock', 'jazz'],
    });
    expect(result.tags).toEqual(['rock', 'jazz']);
  });

  test('output satisfies SerializedSong type', () => {
    const result: SerializedSong = formatSong({
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('tags');
  });
});
