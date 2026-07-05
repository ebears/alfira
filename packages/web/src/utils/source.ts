/**
 * Maps hostnames to source keys. Must mirror the server's SOURCE_DEFINITIONS
 * in packages/server/src/utils/nodelink.ts.
 */
const HOST_TO_SOURCE: Record<string, string> = {
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'music.youtube.com': 'youtube',
  'soundcloud.com': 'soundcloud',
  'www.soundcloud.com': 'soundcloud',
  'open.spotify.com': 'spotify',
  'spotify.com': 'spotify',
  'www.spotify.com': 'spotify',
  'music.apple.com': 'applemusic',
  'tidal.com': 'tidal',
  'www.tidal.com': 'tidal',
  'listen.tidal.com': 'tidal',
  'drive.google.com': 'googledrive',
};

/**
 * Derive a source key from a song's sourceUrl.
 * Returns the source key (e.g. "youtube", "spotify") or null if unparseable/unknown.
 */
export function getSourceKey(sourceUrl: string): string | null {
  try {
    const parsed = new URL(sourceUrl);
    return HOST_TO_SOURCE[parsed.hostname] ?? null;
  } catch {
    return null;
  }
}
