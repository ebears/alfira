import { db, tables, eq } from '../shared/db';
import { logger } from '../shared/logger';

export interface SongMetadata {
  title: string;
  sourceId: string;
  duration: number; // seconds
  thumbnailUrl: string;
  sourceName?: string;
  artist?: string;
  artworkUrl?: string;
}

export interface PlaylistMetadata {
  title: string;
  playlistId: string;
  videoCount: number;
  videos: {
    id: string;
    title: string;
    duration: number;
    thumbnailUrl: string;
    sourceName?: string;
    artist?: string;
    artworkUrl?: string;
  }[];
}

const NODELINK_URL = 'http://127.0.0.1:2333';
const NODELINK_AUTH = 'nodelink-internal';

// ---------------------------------------------------------------------------
// Internal fetch helper — only called with trusted paths
// ---------------------------------------------------------------------------

function nodeLinkHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (NODELINK_AUTH) {
    h.Authorization = NODELINK_AUTH;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Player command types
// ---------------------------------------------------------------------------

interface UpdatePlayerOptions {
  /** Voice server connection details — sent once to establish the voice link. */
  voice?: { token: string; endpoint: string; sessionId: string };
  /** Encoded track to play. Pass { encoded: null } to stop playback. */
  track?: { encoded: string | null };
  /** Volume 0–1000 where 100 = 100%. */
  volume?: number;
  /** Pause or resume. */
  paused?: boolean;
  /** Seek to position in milliseconds. */
  position?: number;
  /** Audio filters (equalizer, compressor, etc.) applied server-side. */
  filters?: Record<string, unknown>;
  /** When true, don't replace the currently playing track. */
  noReplace?: boolean;
}

interface LoadTrackResponse {
  loadType?: string;
  data?: {
    encoded?: string;
    info?: {
      title?: string;
      identifier?: string;
      length?: number; // milliseconds
      isStream?: boolean;
      isSeekable?: boolean;
      position?: number;
      author?: string;
      artworkUrl?: string;
      sourceName?: string;
      name?: string; // playlist name when loadType is "playlist"
      selectedTrack?: number;
    };
    pluginInfo?: Record<string, unknown>;
    tracks?: TrackInfo[]; // NodeLink v3/v4 embeds playlist tracks here
  };
  tracks?: TrackInfo[]; // fallback path
  playlistInfo?: { name?: string; selectedTrack?: number };
  exception?: { message?: string };
}

interface TrackInfo {
  encoded?: string;
  info?: {
    identifier?: string;
    title?: string;
    length?: number;
    isSeekable?: boolean;
    isStream?: boolean;
    position?: number;
    author?: string;
    uri?: string;
    artworkUrl?: string;
    isrc?: string | null;
    sourceName?: string;
  };
  pluginInfo?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Source definitions
//
// Each source has:
// - hosts: hostnames to validate URLs against
// - displayName: human-readable name for UI / error messages
// - isPlaylistUrl: optional fn to detect playlist URLs for this source
// ---------------------------------------------------------------------------

export interface SourceDefinition {
  key: string;
  displayName: string;
  hosts: string[];
  isPlaylistUrl?: (parsed: URL) => boolean;
  requiresCredentials?: boolean;
  helpText?: string;
}

export const SOURCE_DEFINITIONS: Record<string, SourceDefinition> = {
  youtube: {
    key: 'youtube',
    displayName: 'YouTube',
    hosts: ['youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com'],
    isPlaylistUrl: (parsed: URL) => parsed.searchParams.has('list'),
  },
  soundcloud: {
    key: 'soundcloud',
    displayName: 'SoundCloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com'],
    isPlaylistUrl: (parsed: URL) => parsed.pathname.includes('/sets/'),
  },
  spotify: {
    key: 'spotify',
    displayName: 'Spotify',
    hosts: ['open.spotify.com', 'spotify.com', 'www.spotify.com'],
    isPlaylistUrl: (parsed: URL) =>
      parsed.pathname.includes('/playlist/') || parsed.pathname.includes('/album/'),
    requiresCredentials: true,
  },
  applemusic: {
    key: 'applemusic',
    displayName: 'Apple Music',
    hosts: ['music.apple.com'],
    isPlaylistUrl: (parsed: URL) =>
      parsed.pathname.includes('/playlist/') || parsed.pathname.includes('/album/'),
    requiresCredentials: true,
  },
  tidal: {
    key: 'tidal',
    displayName: 'Tidal',
    hosts: ['tidal.com', 'www.tidal.com', 'listen.tidal.com'],
    isPlaylistUrl: (parsed: URL) =>
      parsed.pathname.includes('/playlist/') || parsed.pathname.includes('/album/'),
    requiresCredentials: true,
  },
  googledrive: {
    key: 'googledrive',
    displayName: 'Google Drive',
    hosts: ['drive.google.com'],
    helpText: 'Paste a Google Drive share link to play audio files hosted on Google Drive.',
  },
};

// ---------------------------------------------------------------------------
// Enabled sources cache — mirrors getGuildId() / initGuildId() pattern.
// Loaded async from DB on startup, read synchronously at call time.
// Falls back to ENABLED_SOURCES env var, then to all sources.
// ---------------------------------------------------------------------------

let _cachedEnabledSources: string[] | null = null;
let _enabledSourcesLoaded = false;

const ALL_SOURCE_KEYS = Object.keys(SOURCE_DEFINITIONS);

function getEnabledSourcesSync(): string[] {
  if (_cachedEnabledSources) {
    return _cachedEnabledSources;
  }
  return ALL_SOURCE_KEYS;
}

export function getEnabledSourceDisplayNames(): string[] {
  return getEnabledSourcesSync()
    .map((key) => SOURCE_DEFINITIONS[key]?.displayName)
    .filter((s): s is string => s !== undefined);
}

export function initEnabledSources(): void {
  if (_enabledSourcesLoaded) {
    return;
  }
  try {
    const row = db
      .select({ enabledSources: tables.guildSettings.enabledSources })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get();
    if (row?.enabledSources) {
      _cachedEnabledSources = row.enabledSources
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      _cachedEnabledSources = parseEnabledSourcesEnv();
    }
  } catch {
    _cachedEnabledSources = parseEnabledSourcesEnv();
  }
  _enabledSourcesLoaded = true;
}

function parseEnabledSourcesEnv(): string[] {
  const envVal = process.env.ENABLED_SOURCES;
  if (envVal) {
    const keys = envVal
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const valid = keys.filter((k) => SOURCE_DEFINITIONS[k]);
    if (valid.length > 0) {
      return valid;
    }
  }
  return ALL_SOURCE_KEYS;
}

/** Update the in-memory cache after setup wizard or admin settings save. */
export function refreshEnabledSources(sources: string): void {
  _cachedEnabledSources = sources
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const enabled = getEnabledSourcesSync();
    return enabled.some((key) => {
      const def = SOURCE_DEFINITIONS[key];
      if (!def) {
        return false;
      }
      return def.hosts.some(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      );
    });
  } catch {
    return false;
  }
}

export function isPlaylistUrl(url: string): boolean {
  if (!isValidSourceUrl(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const enabled = getEnabledSourcesSync();
    return enabled.some((key) => {
      const def = SOURCE_DEFINITIONS[key];
      return def?.isPlaylistUrl?.(parsed) ?? false;
    });
  } catch {
    return false;
  }
}

function resolveThumbnail(info: TrackInfo['info']): string {
  const identifier = info?.identifier ?? '';
  const artworkUrl = info?.artworkUrl;
  const sourceName = info?.sourceName;

  // Prefer artworkUrl from NodeLink when available (SoundCloud, Bandcamp, etc.)
  if (artworkUrl) {
    return artworkUrl;
  }

  // Fall back to YouTube thumbnail for YouTube identifiers
  if (sourceName === 'youtube' && identifier) {
    return `https://img.youtube.com/vi/${identifier}/hqdefault.jpg`;
  }

  return '';
}

async function loadTrack(url: string): Promise<LoadTrackResponse> {
  // Fetch loadtracks directly — the identifier is user-controlled so
  // we construct the URL with URLSearchParams to safely encode it.
  const loadUrl = new URL('/v4/loadtracks', NODELINK_URL);
  loadUrl.searchParams.set('identifier', url);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (NODELINK_AUTH) {
    headers.Authorization = NODELINK_AUTH;
  }
  const response = await fetch(loadUrl, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(`NodeLink REST ${response.status}: ${await response.text()}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const data = (await response.json()) as LoadTrackResponse;
  if (data.loadType === 'error' || data.exception) {
    throw new Error(`NodeLink failed to load: ${data.exception?.message ?? 'unknown error'}`);
  }
  return data;
}

export async function getMetadata(url: string): Promise<SongMetadata> {
  const response = await loadTrack(url);

  const data = response.data;

  // If NodeLink returned a playlist response (URL has ?list=...), extract the
  // first track so single-song URLs with playlist parameters still work.
  if (!data?.encoded && !data?.info && data?.tracks?.length) {
    const first = data.tracks[0];
    if (!first?.info) {
      throw new Error('NodeLink returned no track data');
    }
    const info = first.info;
    const sourceId = info.identifier ?? '';
    const title = info.title ?? 'Unknown';
    const artist = info.author || undefined;
    const artworkUrl = info.artworkUrl || undefined;
    return {
      title,
      sourceId,
      duration: Math.round((info.length ?? 0) / 1000),
      thumbnailUrl: resolveThumbnail(info),
      sourceName: info.sourceName,
      artist,
      artworkUrl,
    };
  }

  if (!data?.encoded || !data.info) {
    throw new Error('NodeLink returned no track data');
  }

  const info = data.info;
  const sourceId = info.identifier ?? '';
  const title = info.title ?? 'Unknown';

  const artist = info.author || undefined;
  const artworkUrl = info.artworkUrl || undefined;

  return {
    title,
    sourceId,
    duration: Math.round((info.length ?? 0) / 1000),
    thumbnailUrl: resolveThumbnail(info),
    sourceName: info.sourceName,
    artist,
    artworkUrl,
  };
}

export async function getStreamFormat(
  url: string
): Promise<{ track: string; isWebmOpus: boolean }> {
  const response = await loadTrack(url);

  const data = response.data;

  // If NodeLink returned a playlist response (because URL has ?list=...),
  // extract the first track from the embedded tracks array.
  if (!data?.encoded && data?.tracks?.length) {
    const first = data.tracks[0];
    if (!first?.encoded) {
      throw new Error('NodeLink returned no track');
    }
    return { track: first.encoded, isWebmOpus: true };
  }

  if (!data?.encoded) {
    throw new Error('NodeLink returned no track');
  }

  // NodeLink always provides Opus in Webm container via Lavalink-compatible protocol
  return { track: data.encoded, isWebmOpus: true };
}

export async function getPlaylistMetadataWithVideos(
  playlistUrl: string,
  maxVideos?: number
): Promise<PlaylistMetadata> {
  // NodeLink v4 uses /v4/loadtracks with the playlist URL.
  // It returns a "playlist" loadType with track array.
  const response = await loadTrack(playlistUrl);

  // NodeLink v3/v4 embeds playlist tracks inside response.data for playlist loadType
  const tracks = response.data?.tracks ?? response.tracks ?? [];
  const playlistName =
    response.data?.info?.name ?? response.playlistInfo?.name ?? 'Unknown Playlist';

  const limited = maxVideos ? tracks.slice(0, maxVideos) : tracks;

  const videos = limited.map((t) => {
    const id = t.info?.identifier ?? '';
    return {
      id,
      title: t.info?.title ?? 'Unknown',
      duration: Math.round((t.info?.length ?? 0) / 1000),
      thumbnailUrl: resolveThumbnail(t.info),
      sourceName: t.info?.sourceName,
      artist: t.info?.author || undefined,
      artworkUrl: t.info?.artworkUrl || undefined,
    };
  });

  return {
    title: playlistName,
    playlistId: playlistUrl,
    videoCount: tracks.length,
    videos,
  };
}

export async function preloadTrack(guildId: string, sessionId: string, url: string): Promise<void> {
  // Resolve the track via NodeLink's loadtracks endpoint.  Use the same
  // fallback as getStreamFormat: if data.encoded is missing (e.g.
  // playlist/search response), grab the first track from data.tracks.
  const data = await loadTrack(url);
  const encoded = data.data?.encoded ?? data.data?.tracks?.[0]?.encoded;
  if (!encoded) {
    throw new Error('NodeLink returned no encoded track for preload');
  }

  // Set nextTrack on the player.  Only send nextTrack — do NOT include
  // track in the PATCH body, otherwise NodeLink will restart the
  // currently-playing track.
  const patchUrl = new URL(
    `/v4/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(guildId)}`,
    NODELINK_URL
  );
  const patchResp = await fetch(patchUrl, {
    method: 'PATCH',
    headers: nodeLinkHeaders(),
    body: JSON.stringify({ nextTrack: { encoded } }),
  });
  if (!patchResp.ok) {
    throw new Error(`NodeLink preload PATCH returned ${patchResp.status}`);
  }

  logger.info({ guildId, url }, 'Gapless preload succeeded');
}

// ---------------------------------------------------------------------------
// Player control (REST)
// ---------------------------------------------------------------------------

/**
 * Update a NodeLink player via REST PATCH.
 *
 * All player commands (play, stop, pause, seek, volume, filters, voice
 * connection) go through the same endpoint with different body fields.
 */
export async function updateNodeLinkPlayer(
  guildId: string,
  sessionId: string,
  options: UpdatePlayerOptions
): Promise<void> {
  // Build URL from trusted internal identifiers only.
  const url = new URL(
    `/v4/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(guildId)}`,
    NODELINK_URL
  );
  const response = await fetch(url, {
    method: 'PATCH',
    headers: nodeLinkHeaders(),
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    throw new Error(`NodeLink REST ${response.status}: ${await response.text()}`);
  }
}

/**
 * Destroy a NodeLink player via REST DELETE.
 *
 * This tears down the voice session on NodeLink. The WebSocket will emit
 * a WebSocketClosedEvent when the destroy is confirmed.
 */
export async function destroyNodeLinkPlayer(guildId: string, sessionId: string): Promise<void> {
  const url = new URL(
    `/v4/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(guildId)}`,
    NODELINK_URL
  );
  const response = await fetch(url, {
    method: 'DELETE',
    headers: nodeLinkHeaders(),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`NodeLink REST ${response.status}: ${await response.text()}`);
  }
}
