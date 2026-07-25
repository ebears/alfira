import { describe, expect, test } from 'bun:test';

import { getSourceKey } from './source';

describe('getSourceKey', () => {
  test('maps youtube.com to youtube', () => {
    expect(getSourceKey('https://youtube.com/watch?v=abc')).toBe('youtube');
  });

  test('maps www.youtube.com to youtube', () => {
    expect(getSourceKey('https://www.youtube.com/watch?v=abc')).toBe('youtube');
  });

  test('maps music.youtube.com to youtube', () => {
    expect(getSourceKey('https://music.youtube.com/watch?v=abc')).toBe('youtube');
  });

  test('maps youtu.be to youtube', () => {
    expect(getSourceKey('https://youtu.be/abc')).toBe('youtube');
  });

  test('maps soundcloud.com to soundcloud', () => {
    expect(getSourceKey('https://soundcloud.com/artist/track')).toBe('soundcloud');
  });

  test('maps www.soundcloud.com to soundcloud', () => {
    expect(getSourceKey('https://www.soundcloud.com/artist/track')).toBe('soundcloud');
  });

  test('maps open.spotify.com to spotify', () => {
    expect(getSourceKey('https://open.spotify.com/track/123')).toBe('spotify');
  });

  test('maps spotify.com to spotify', () => {
    expect(getSourceKey('https://spotify.com/track/123')).toBe('spotify');
  });

  test('maps www.spotify.com to spotify', () => {
    expect(getSourceKey('https://www.spotify.com/track/123')).toBe('spotify');
  });

  test('maps music.apple.com to applemusic', () => {
    expect(getSourceKey('https://music.apple.com/album/123')).toBe('applemusic');
  });

  test('maps tidal.com to tidal', () => {
    expect(getSourceKey('https://tidal.com/browse/track/123')).toBe('tidal');
  });

  test('maps www.tidal.com to tidal', () => {
    expect(getSourceKey('https://www.tidal.com/browse/track/123')).toBe('tidal');
  });

  test('maps listen.tidal.com to tidal', () => {
    expect(getSourceKey('https://listen.tidal.com/track/123')).toBe('tidal');
  });

  test('maps drive.google.com to googledrive', () => {
    expect(getSourceKey('https://drive.google.com/file/d/abc/view')).toBe('googledrive');
  });

  test('returns null for unknown hostname', () => {
    expect(getSourceKey('https://example.com/video')).toBeNull();
  });

  test('returns null for unparseable URL', () => {
    expect(getSourceKey('not-a-url')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(getSourceKey('')).toBeNull();
  });

  test('URL with path and query still resolves by hostname', () => {
    expect(getSourceKey('https://youtube.com/watch?v=abc&list=xyz&index=1')).toBe('youtube');
  });

  test('URL with fragment still resolves by hostname', () => {
    expect(getSourceKey('https://soundcloud.com/artist/track#t=1:30')).toBe('soundcloud');
  });

  test('http URLs work the same as https', () => {
    expect(getSourceKey('http://youtube.com/watch?v=abc')).toBe('youtube');
  });
});
