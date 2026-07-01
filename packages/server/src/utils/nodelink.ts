interface SongMetadata {
  title: string;
  youtubeId: string;
  duration: number; // seconds
  thumbnailUrl: string;
}

export interface PlaylistMetadata {
  title: string;
  playlistId: string;
  videoCount: number;
  videos: { id: string; title: string; duration: number; thumbnailUrl: string }[];
}

const NODELINK_URL = 'http://127.0.0.1:2333';
const NODELINK_AUTH = 'nodelink-internal';

import { logger } from '../shared/logger';

// ---------------------------------------------------------------------------
// Internal fetch helper — only called with trusted paths
// ---------------------------------------------------------------------------

function nodeLinkHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (NODELINK_AUTH) h.Authorization = NODELINK_AUTH;
  return h;
}

// ---------------------------------------------------------------------------
// Player command types
// ---------------------------------------------------------------------------

export interface UpdatePlayerOptions {
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

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com'];

export function isValidYouTubeUrl(url: string): boolean {
  try {
    return YOUTUBE_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isYouTubePlaylistUrl(url: string): boolean {
  if (!isValidYouTubeUrl(url)) return false;
  try {
    return new URL(url).searchParams.has('list');
  } catch {
    return false;
  }
}

async function loadTrack(url: string): Promise<LoadTrackResponse> {
  // Fetch loadtracks directly — the identifier is user-controlled so
  // we construct the URL with URLSearchParams to safely encode it.
  const loadUrl = new URL('/v4/loadtracks', NODELINK_URL);
  loadUrl.searchParams.set('identifier', url);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (NODELINK_AUTH) headers.Authorization = NODELINK_AUTH;
  const response = await fetch(loadUrl, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(`NodeLink REST ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as LoadTrackResponse;
  if (data.loadType === 'error' || data.exception) {
    throw new Error(`NodeLink failed to load: ${data.exception?.message ?? 'unknown error'}`);
  }
  return data;
}

export async function getMetadata(youtubeUrl: string): Promise<SongMetadata> {
  const response = await loadTrack(youtubeUrl);

  const data = response.data;

  // If NodeLink returned a playlist response (URL has ?list=...), extract the
  // first track so single-song URLs with playlist parameters still work.
  if (!data?.encoded && !data?.info && data?.tracks?.length) {
    const first = data.tracks[0];
    if (!first?.info) throw new Error('NodeLink returned no track data');
    const info = first.info;
    const youtubeId = info.identifier ?? '';
    const title = info.title ?? 'Unknown';
    return {
      title,
      youtubeId,
      duration: (info.length ?? 0) / 1000,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  if (!data?.encoded || !data.info) {
    throw new Error('NodeLink returned no track data');
  }

  const info = data.info;
  const youtubeId = info.identifier ?? '';
  const title = info.title ?? 'Unknown';

  return {
    title,
    youtubeId,
    duration: (info.length ?? 0) / 1000,
    thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
  };
}

export async function getStreamFormat(
  youtubeUrl: string
): Promise<{ track: string; isWebmOpus: boolean }> {
  const response = await loadTrack(youtubeUrl);

  const data = response.data;

  // If NodeLink returned a playlist response (because URL has ?list=...),
  // extract the first track from the embedded tracks array.
  if (!data?.encoded && data?.tracks?.length) {
    const first = data.tracks[0];
    if (!first?.encoded) throw new Error('NodeLink returned no track');
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
  // NodeLink v4 uses /v4/loadtracks with YouTube playlist URL.
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
      duration: (t.info?.length ?? 0) / 1000,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  });

  return {
    title: playlistName,
    playlistId: playlistUrl,
    videoCount: tracks.length,
    videos,
  };
}

export async function preloadTrack(
  guildId: string,
  sessionId: string,
  youtubeUrl: string,
  _currentEncoded?: string
): Promise<void> {
  try {
    const loadUrl = new URL('/v4/loadtracks', NODELINK_URL);
    loadUrl.searchParams.set('identifier', youtubeUrl);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (NODELINK_AUTH) headers.Authorization = NODELINK_AUTH;
    const resp = await fetch(loadUrl, { method: 'GET', headers });
    if (!resp.ok) return;
    const data = (await resp.json()) as LoadTrackResponse;
    const encoded = data.data?.encoded;
    if (!encoded) return; // Track couldn't be resolved

    // Only send nextTrack — do NOT include the current track in the PATCH
    // body. The Lavalink v4 spec expects noReplace as a query parameter, not
    // a body field. Including track in the body without a proper noReplace
    // query param causes NodeLink to restart the currently-playing track
    // (audible restart glitch ~500ms into playback).
    const patchUrl = new URL(`/v4/sessions/${sessionId}/players/${guildId}`, NODELINK_URL);
    const patchResp = await fetch(patchUrl, {
      method: 'PATCH',
      headers: nodeLinkHeaders(),
      body: JSON.stringify({ nextTrack: { encoded } }),
    });
    if (!patchResp.ok) {
      logger.warn({ status: patchResp.status }, 'Gapless preload PATCH failed');
    }
  } catch {
    logger.warn({ guildId, youtubeUrl }, 'Gapless preload failed');
  }
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
  const url = new URL(`/v4/sessions/${sessionId}/players/${guildId}`, NODELINK_URL);
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
  const url = new URL(`/v4/sessions/${sessionId}/players/${guildId}`, NODELINK_URL);
  const response = await fetch(url, {
    method: 'DELETE',
    headers: nodeLinkHeaders(),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`NodeLink REST ${response.status}: ${await response.text()}`);
  }
}
