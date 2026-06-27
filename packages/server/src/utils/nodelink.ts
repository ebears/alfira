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

async function restRequest<T>(path: string): Promise<T> {
  const headers: { 'Content-Type': string; Authorization?: string } = {
    'Content-Type': 'application/json',
  };
  if (NODELINK_AUTH) headers.Authorization = NODELINK_AUTH;

  const url = `${NODELINK_URL}${path}`;
  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(`NodeLink REST ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
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
  currentEncoded?: string
): Promise<void> {
  try {
    const response = await restRequest<LoadTrackResponse>(
      `/v4/loadtracks?identifier=${encodeURIComponent(youtubeUrl)}`
    );
    const encoded = response.data?.encoded;
    if (!encoded) return; // Track couldn't be resolved

    const url = `${NODELINK_URL}/v4/sessions/${sessionId}/players/${guildId}`;
    const headers: { 'Content-Type': string; Authorization?: string } = {
      'Content-Type': 'application/json',
    };
    if (NODELINK_AUTH) headers.Authorization = NODELINK_AUTH;

    const body: Record<string, unknown> = { nextTrack: { encoded } };
    // Include current track if provided so NodeLink associates this with the active player session
    if (currentEncoded) {
      body.track = { encoded: currentEncoded };
    }

    await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    logger.warn({ guildId, youtubeUrl }, 'Gapless preload failed');
  }
}
