import type {
  GeneralSettings,
  LoopMode,
  PaginatedResult,
  PaginationMeta,
  Playlist,
  PlaylistDetail,
  QueueState,
  SetupChannel,
  SetupGuild,
  SetupRole,
  SetupStatus,
  Song,
  User,
} from './types';

/**
 * Centralized API service layer for making HTTP requests.
 * Provides reusable functions for common API patterns.
 */

// Base API client - to be injected or configured externally
let apiClient: {
  get: <T>(url: string) => Promise<{ data: T }>;
  post: <T>(url: string, data?: unknown) => Promise<{ data: T }>;
  patch: <T>(url: string, data: unknown) => Promise<{ data: T }>;
  delete: <T>(url: string) => Promise<{ data: T }>;
} | null = null;

/**
 * Configure the API client to be used by all service functions
 */
export function configureApiClient(client: {
  get: <T>(url: string) => Promise<{ data: T }>;
  post: <T>(url: string, data?: unknown) => Promise<{ data: T }>;
  patch: <T>(url: string, data: unknown) => Promise<{ data: T }>;
  delete: <T>(url: string) => Promise<{ data: T }>;
}) {
  apiClient = client;
}

// ---------------------------------------------------------------------------
// Generic API Functions
// ---------------------------------------------------------------------------

/**
 * Generic GET request
 */
export async function get<T>(url: string): Promise<T> {
  if (!apiClient) {
    throw new Error('API client not configured. Call configureApiClient() first.');
  }
  const response = await apiClient.get<T>(url);
  return response.data;
}

/**
 * Generic POST request
 */
export async function post<T>(url: string, data?: unknown): Promise<T> {
  if (!apiClient) {
    throw new Error('API client not configured. Call configureApiClient() first.');
  }
  const response = await apiClient.post<T>(url, data);
  return response.data;
}

/**
 * Generic PATCH request
 */
export async function patch<T>(url: string, data: unknown): Promise<T> {
  if (!apiClient) {
    throw new Error('API client not configured. Call configureApiClient() first.');
  }
  const response = await apiClient.patch<T>(url, data);
  return response.data;
}

/**
 * Generic DELETE request
 */
export async function remove<T>(url: string): Promise<T> {
  if (!apiClient) {
    throw new Error('API client not configured. Call configureApiClient() first.');
  }
  const response = await apiClient.delete<T>(url);
  return response.data;
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export function fetchVersion(): Promise<{ version: string }> {
  return get<{ version: string }>('/api/version');
}

// ---------------------------------------------------------------------------
// Auth API Functions
// ---------------------------------------------------------------------------

export function fetchMe(): Promise<User> {
  return get<{ user: User }>('/auth/me').then((r) => r.user);
}

export function fetchLogout(): Promise<void> {
  return post('/auth/logout');
}

// ---------------------------------------------------------------------------
// Songs API Functions
// ---------------------------------------------------------------------------

export function fetchSongsPage(
  page: number,
  limit = 30,
  search?: string
): Promise<PaginatedResult<Song>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  return get(`/api/songs?${params}`);
}

export function createSong(url: string, nickname?: string, asPlaylist?: boolean): Promise<Song> {
  return post('/api/songs', {
    url,
    ...(nickname && { nickname }),
    ...(asPlaylist && { asPlaylist }),
  });
}

export function deleteSong(id: string): Promise<void> {
  return remove(`/api/songs/${id}`);
}

/**
 * Data for updating a song. Only provide fields you want to change.
 */
export interface SongUpdateData {
  nickname?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
}

/**
 * Update a song's editable fields. Admin only.
 */
export function updateSong(id: string, data: SongUpdateData): Promise<Song> {
  return patch(`/api/songs/${id}`, data);
}

export interface TagItem {
  canonicalName: string;
  nameLower: string;
  color?: string | null;
}

export function fetchTags(): Promise<TagItem[]> {
  return get<{ tags: TagItem[] }>('/api/tags').then((r) => r.tags);
}

export function fetchTagSongs(nameLower: string): Promise<Song[]> {
  return get<{ songs: Song[] }>(`/api/tags/${nameLower}/songs`).then((r) => r.songs);
}

export function updateTag(
  nameLower: string,
  data: { canonicalName?: string; color?: string | null }
): Promise<{ tag: TagItem }> {
  return patch(`/api/tags/${nameLower}`, data);
}

export function deleteTag(nameLower: string): Promise<{ success: boolean }> {
  return remove(`/api/tags/${nameLower}`);
}

// ---------------------------------------------------------------------------
// Playlists API Functions
// ---------------------------------------------------------------------------

export function fetchPlaylists(adminView = false): Promise<Playlist[]> {
  const params = adminView ? '?adminView=true' : '';
  return get<PaginatedResult<Playlist>>(`/api/playlists${params}`).then(
    (r) => r.items as Playlist[]
  );
}

export function createPlaylist(name: string): Promise<Playlist> {
  return post('/api/playlists', { name });
}

export function fetchPlaylistsPage(
  adminView = false,
  page: number,
  limit = 30
): Promise<PaginatedResult<Playlist>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (adminView) params.set('adminView', 'true');
  return get(`/api/playlists?${params}`);
}

export function fetchPlaylistPage(
  id: string,
  adminView = false,
  page: number,
  limit = 30,
  search?: string
): Promise<PlaylistDetail & { pagination: PaginationMeta }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (adminView) params.set('adminView', 'true');
  if (search) params.set('search', search);
  return get(`/api/playlists/${id}?${params}`);
}

export function renamePlaylist(id: string, name: string): Promise<Playlist> {
  return patch(`/api/playlists/${id}`, { name });
}

export function deletePlaylist(id: string): Promise<void> {
  return remove(`/api/playlists/${id}`);
}

export function addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
  return post(`/api/playlists/${playlistId}/songs`, { songId });
}

export function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  return remove(`/api/playlists/${playlistId}/songs/${songId}`);
}

export function togglePlaylistVisibility(
  playlistId: string,
  isPrivate: boolean,
  adminView = false
): Promise<Playlist> {
  const params = adminView ? '?adminView=true' : '';
  return patch(`/api/playlists/${playlistId}/visibility${params}`, { isPrivate });
}

// ---------------------------------------------------------------------------
// Player API Functions
// ---------------------------------------------------------------------------

export function fetchQueueState(): Promise<QueueState> {
  return get('/api/player/queue');
}

export function startPlayback(opts: {
  playlistId?: string;
  mode: 'sequential' | 'random';
  loop: LoopMode;
  startFromSongId?: string;
}): Promise<void> {
  return post('/api/player/play', opts);
}

export function skipTrack(): Promise<void> {
  return post('/api/player/skip');
}

export function leaveVoice(): Promise<void> {
  return post('/api/player/leave');
}

export function setLoopMode(mode: LoopMode): Promise<void> {
  return post('/api/player/loop', { mode });
}

export function shuffleQueue(): Promise<void> {
  return post('/api/player/shuffle');
}

export function unshuffleQueue(): Promise<void> {
  return post('/api/player/unshuffle');
}

export function clearQueue(): Promise<void> {
  return post('/api/player/clear');
}

export function togglePause(): Promise<{ isPaused: boolean }> {
  return post('/api/player/pause-toggle');
}

export function seek(positionMs: number): Promise<void> {
  return post('/api/player/seek', { position: positionMs });
}

export function quickAddToQueue(url: string): Promise<{
  message: string;
  song: { title: string; duration: number; thumbnailUrl: string; requestedBy: string };
}> {
  return post('/api/player/quick-add', { url });
}

export function quickAddPlaylistToQueue(
  url: string,
  maxVideos?: number
): Promise<{
  message: string;
  playlistTitle: string;
  totalVideos: number;
  queuedCount: number;
  songs: Array<{ title: string; duration: number; thumbnailUrl: string; requestedBy: string }>;
}> {
  return post('/api/player/quick-add-playlist', {
    url,
    ...(maxVideos && { maxVideos }),
  });
}

export function addToPriorityQueue(songId: string): Promise<{
  message: string;
  song: { title: string; duration: number; thumbnailUrl: string; requestedBy: string };
}> {
  return post('/api/player/add-to-priority', { songId });
}

export function overridePlay(url: string): Promise<{
  message: string;
  song: { title: string; duration: number; thumbnailUrl: string; requestedBy: string };
}> {
  return post('/api/player/override', { url });
}

// ---------------------------------------------------------------------------
// Import Playlist API Functions
// ---------------------------------------------------------------------------

export interface ImportPlaylistResult {
  message: string;
  playlistTitle: string;
  totalVideos: number;
  importedCount: number;
  skippedCount: number;
  songs: Song[];
}

export function importPlaylist(url: string, maxVideos?: number): Promise<ImportPlaylistResult> {
  return post('/api/songs/import-playlist', { url, ...(maxVideos && { maxVideos }) });
}

// ---------------------------------------------------------------------------
// Setup API Functions
// ---------------------------------------------------------------------------

export function fetchSetupStatus(): Promise<SetupStatus> {
  return get('/api/setup/status');
}

export function fetchSetupGuilds(): Promise<{ guilds: SetupGuild[] }> {
  return get('/api/setup/guilds');
}

export function fetchSetupRoles(guildId: string): Promise<{ roles: SetupRole[] }> {
  return get(`/api/setup/roles?guildId=${encodeURIComponent(guildId)}`);
}

export function fetchSetupChannels(guildId: string): Promise<{ channels: SetupChannel[] }> {
  return get(`/api/setup/channels?guildId=${encodeURIComponent(guildId)}`);
}

export interface CompleteSetupPayload {
  guildId: string;
  adminRoleIds: string;
  voiceIdleTimeoutMinutes: number;
  notificationChannelId?: string | null;
  publicUrl?: string | null;
  enabledSources?: string;
}

export function completeSetup(data: CompleteSetupPayload): Promise<{ success: boolean }> {
  return post('/api/setup/complete', data);
}

// ---------------------------------------------------------------------------
// General Settings API Functions
// ---------------------------------------------------------------------------

export function fetchGeneralSettings(): Promise<GeneralSettings> {
  return get('/api/settings/general');
}

export type GeneralSettingsUpdate = Partial<
  Pick<
    GeneralSettings,
    | 'adminRoleIds'
    | 'voiceIdleTimeoutMinutes'
    | 'notificationChannelId'
    | 'publicUrl'
    | 'enabledSources'
  >
>;

export function updateGeneralSettings(data: GeneralSettingsUpdate): Promise<GeneralSettings> {
  return patch('/api/settings/general', data);
}
