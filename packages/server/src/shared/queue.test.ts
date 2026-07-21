import { describe, expect, test } from 'bun:test';

import { toQueuedSong } from './queue';
import { type Song } from './types';

const baseSong: Song = {
  id: 'abc-123',
  title: 'Test Song',
  sourceUrl: 'https://example.com/video',
  sourceId: 'video-1',
  duration: 180,
  thumbnailUrl: 'https://example.com/thumb.jpg',
  addedBy: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('toQueuedSong', () => {
  test('preserves all song properties', () => {
    const result = toQueuedSong(baseSong, 'TestUser');
    expect(result.id).toBe(baseSong.id);
    expect(result.title).toBe(baseSong.title);
    expect(result.sourceUrl).toBe(baseSong.sourceUrl);
    expect(result.sourceId).toBe(baseSong.sourceId);
    expect(result.duration).toBe(baseSong.duration);
    expect(result.thumbnailUrl).toBe(baseSong.thumbnailUrl);
    expect(result.addedBy).toBe(baseSong.addedBy);
    expect(result.createdAt).toBe(baseSong.createdAt);
  });

  test('attaches requestedBy', () => {
    const result = toQueuedSong(baseSong, 'DJ Foobar');
    expect(result.requestedBy).toBe('DJ Foobar');
  });

  test('preserves optional fields', () => {
    const songWithOptionals: Song = {
      ...baseSong,
      nickname: 'Custom Name',
      artist: 'Some Artist',
      album: 'Some Album',
      tags: ['rock', 'chill'],
      volumeBoost: 1.5,
    };
    const result = toQueuedSong(songWithOptionals, 'User');
    expect(result.nickname).toBe('Custom Name');
    expect(result.artist).toBe('Some Artist');
    expect(result.album).toBe('Some Album');
    expect(result.tags).toEqual(['rock', 'chill']);
    expect(result.volumeBoost).toBe(1.5);
  });
});
