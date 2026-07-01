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

async function restRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: { 'Content-Type': string; Authorization?: string } = {
    'Content-Type': 'application/json',
  };
  if (NODELINK_AUTH) headers.Authorization = NODELINK_AUTH;

  // Build URL via the URL constructor to prevent injection.
  // NodeLink only serves paths under /v4/.
  const url = new URL(path, NODELINK_URL);
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`NodeLink REST ${response.status}: ${await response.text()}`);
  }

  // DELETE returns 204 No Content with no body
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
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
  const response = await restRequest<LoadTrackResponse>(
    'GET',
    `/v4/loadtracks?identifier=${encodeURIComponent(url)}`
  );
  if (response.loadType === 'error' || response.exception) {
    throw new Error(`NodeLink failed to load: ${response.exception?.message ?? 'unknown error'}`);
  }
  return response;
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
    const response = await restRequest<LoadTrackResponse>(
      'GET',
      `/v4/loadtracks?identifier=${encodeURIComponent(youtubeUrl)}`
    );
    const encoded = response.data?.encoded;
    if (!encoded) return; // Track couldn't be resolved

    // Only send nextTrack — do NOT include the current track in the PATCH
    // body. The Lavalink v4 spec expects noReplace as a query parameter, not
    // a body field. Including track in the body without a proper noReplace
    // query param causes NodeLink to restart the currently-playing track
    // (audible restart glitch ~500ms into playback).
    await restRequest('PATCH', `/v4/sessions/${sessionId}/players/${guildId}`, {
      nextTrack: { encoded },
    });
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
  await restRequest('PATCH', `/v4/sessions/${sessionId}/players/${guildId}`, options);
}

/**
 * Destroy a NodeLink player via REST DELETE.
 *
 * This tears down the voice session on NodeLink. The WebSocket will emit
 * a WebSocketClosedEvent when the destroy is confirmed.
 */
export async function destroyNodeLinkPlayer(guildId: string, sessionId: string): Promise<void> {
  await restRequest('DELETE', `/v4/sessions/${sessionId}/players/${guildId}`);
}
