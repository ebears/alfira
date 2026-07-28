// ---------------------------------------------------------------------------
// Typed API functions — thin wrappers around the Eden Treaty client.
//
// Each function uses Eden's proxy chain for URL construction, then unwraps
// the { data, error } response: throws ApiError on error, returns data.
//
// When tsgo supports Elysia's generic types, these wrappers become optional
// and components can consume Eden directly with full type inference.
// ---------------------------------------------------------------------------

import {
  type GeneralSettings,
  type LoopMode,
  type PaginatedResult,
  type PaginationMeta,
  type Playlist,
  type PlaylistDetail,
  type QueueState,
  type RequestPreview,
  type SetupChannel,
  type SetupGuild,
  type SetupRole,
  type SetupStatus,
  type Song,
  type SongRequest,
  type User,
} from '@alfira/server/shared';

import { api, ApiError } from './eden';

const $ = api;

// ---------------------------------------------------------------------------
// Response unwrapping
// ---------------------------------------------------------------------------

// Explicit `any` — Elysia's TreatyResponse discriminated union type is not
// compatible with a generic T parameter. The call site's return type annotation
// provides the actual type safety.
function unwrap(result: any): any {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (result.error) {
    const err = result.error as { status: number; value: unknown };
    const body = err.value as { error?: string; code?: string } | undefined;
    const message = body?.error ?? `API error: ${err.status}`;
    throw new ApiError(message, err.status, body?.code);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export function fetchVersion(): Promise<{ version: string }> {
  return $.api.version.get().then(unwrap);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function fetchMe(): Promise<User> {
  return $.auth.me.get().then((r) => {
    return unwrap(r).user;
  });
}

export function fetchLogout(): Promise<void> {
  return $.auth.logout.post().then(() => undefined);
}

// ---------------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------------

export interface FetchSongsOptions {
  search?: string;
  sort?: string;
  order?: string;
  tags?: string;
  source?: string;
}

export function fetchSongsPage(
  page: number,
  limit = 30,
  opts?: FetchSongsOptions
): Promise<PaginatedResult<Song>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (opts?.search) {
    params.set('search', opts.search);
  }
  if (opts?.sort) {
    params.set('sort', opts.sort);
  }
  if (opts?.order) {
    params.set('order', opts.order);
  }
  if (opts?.tags) {
    params.set('tags', opts.tags);
  }
  if (opts?.source) {
    params.set('source', opts.source);
  }
  return $.api.songs.get({ query: Object.fromEntries(params) }).then(unwrap);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface RequestCreateData {
  sourceUrl: string;
  /** Explicitly request a playlist import — skips ?list= stripping. */
  type?: 'playlist';
  notifyDm?: boolean;
  nickname?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
}

export interface CreateRequestResult {
  request?: SongRequest;
  song?: Song;
  songs?: Song[];
  autoApproved: boolean;
  importedCount?: number;
  skippedCount?: number;
  playlistTitle?: string;
}

export function createRequest(data: RequestCreateData): Promise<CreateRequestResult> {
  return $.api.requests
    .post({
      sourceUrl: data.sourceUrl,
      type: data.type,
      notifyDm: data.notifyDm ?? false,
      ...(data.nickname != null && { nickname: data.nickname }),
      ...(data.artist != null && { artist: data.artist }),
      ...(data.album != null && { album: data.album }),
      ...(data.artwork != null && { artwork: data.artwork }),
      ...(data.tags != null && { tags: data.tags }),
      ...(data.volumeBoost !== undefined && { volumeBoost: data.volumeBoost }),
    })
    .then(unwrap);
}

export function previewRequest(url: string): Promise<RequestPreview> {
  return $.api.requests.preview.post({ url }).then(unwrap);
}

export interface FetchRequestsResult {
  items: SongRequest[];
  pagination: PaginationMeta;
}

export function fetchRequests(
  page: number,
  limit = 30,
  opts?: { status?: string; mine?: boolean }
): Promise<FetchRequestsResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (opts?.status) {
    params.set('status', opts.status);
  }
  if (opts?.mine) {
    params.set('mine', 'true');
  }
  return $.api.requests.get({ query: Object.fromEntries(params) }).then(unwrap);
}

export function approveRequest(id: string): Promise<{ request: SongRequest; songs?: Song[] }> {
  return $.api.requests({ id }).patch({ status: 'approved' }).then(unwrap);
}

export function denyRequest(id: string): Promise<{ request: SongRequest }> {
  return $.api.requests({ id }).patch({ status: 'denied' }).then(unwrap);
}

export function cancelRequest(id: string): Promise<void> {
  return $.api
    .requests({ id })
    .delete()
    .then(() => undefined);
}

export function deleteSong(id: string): Promise<void> {
  return $.api
    .songs({ id })
    .delete()
    .then(() => undefined);
}

export function bulkDeleteSongs(ids: string[]): Promise<{ deleted: number }> {
  return $.api.songs['bulk-delete'].post({ ids }).then(unwrap);
}

export function bulkTagSongs(
  ids: string[],
  tags: string[],
  mode: 'add' | 'set' = 'add'
): Promise<{ updated: number; tags: string[] }> {
  return $.api.songs['bulk-tag'].post({ ids, tags, mode }).then(unwrap);
}

export interface BulkEditData {
  nickname?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
  clearFields?: string[];
}

export function bulkEditSongs(ids: string[], data: BulkEditData): Promise<{ updated: number }> {
  return $.api.songs['bulk-edit'].post({ ids, ...data }).then(unwrap);
}

export interface SongUpdateData {
  nickname?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
}

export function updateSong(id: string, data: SongUpdateData): Promise<Song> {
  return $.api.songs({ id }).patch(data).then(unwrap);
}

export interface TagItem {
  canonicalName: string;
  nameLower: string;
  color?: string | null;
}

export function fetchTags(): Promise<TagItem[]> {
  return $.api.tags.get().then((r) => {
    return unwrap(r).tags;
  });
}

export function fetchTagSongs(nameLower: string): Promise<Song[]> {
  return $.api
    .tags({ nameLower })
    .songs.get()
    .then((r) => {
      return unwrap(r).songs;
    });
}

export function updateTag(
  nameLower: string,
  data: { canonicalName?: string; color?: string | null }
): Promise<{ tag: TagItem }> {
  return $.api
    .tags({ nameLower })
    .patch(data as any)
    .then(unwrap) as Promise<{ tag: TagItem }>;
}

export function deleteTag(nameLower: string): Promise<{ success: boolean }> {
  return $.api.tags({ nameLower }).delete().then(unwrap);
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export function createPlaylist(name: string, tagNameLower?: string): Promise<Playlist> {
  return $.api.playlists.post({ name, ...(tagNameLower && { tagNameLower }) }).then(unwrap);
}

export function fetchPlaylistsPage(
  adminView = false,
  page: number,
  limit = 30
): Promise<PaginatedResult<Playlist>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (adminView) {
    params.set('adminView', 'true');
  }
  return $.api.playlists.get({ query: Object.fromEntries(params) }).then(unwrap);
}

export function fetchPlaylistPage(
  id: string,
  adminView = false,
  page: number,
  limit = 30,
  opts?: FetchSongsOptions
): Promise<PlaylistDetail & { pagination: PaginationMeta }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (adminView) {
    params.set('adminView', 'true');
  }
  if (opts?.search) {
    params.set('search', opts.search);
  }
  if (opts?.sort) {
    params.set('sort', opts.sort);
  }
  if (opts?.order) {
    params.set('order', opts.order);
  }
  if (opts?.tags) {
    params.set('tags', opts.tags);
  }
  if (opts?.source) {
    params.set('source', opts.source);
  }
  return $.api
    .playlists({ id })
    .get({ query: Object.fromEntries(params) })
    .then(unwrap);
}

export function renamePlaylist(id: string, name: string): Promise<Playlist> {
  return $.api.playlists({ id }).patch({ name }).then(unwrap);
}

export function updatePlaylistTag(id: string, tagNameLower: string | null): Promise<Playlist> {
  return $.api
    .playlists({ id })
    .patch({ tagNameLower } as any)
    .then(unwrap);
}

export function deletePlaylist(id: string): Promise<void> {
  return $.api
    .playlists({ id })
    .delete()
    .then(() => undefined);
}

export function addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
  return $.api
    .playlists({ id: playlistId })
    .songs.post({ songId })
    .then(() => undefined);
}

export function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  return $.api
    .playlists({ id: playlistId })
    .songs({ songId })
    .delete()
    .then(() => undefined);
}

export function bulkRemoveSongsFromPlaylist(
  playlistId: string,
  songIds: string[]
): Promise<{ removed: number }> {
  return $.api.playlists({ id: playlistId }).songs['bulk-remove'].post({ songIds }).then(unwrap);
}

export function togglePlaylistVisibility(
  playlistId: string,
  isPrivate: boolean,
  adminView = false
): Promise<Playlist> {
  const query = adminView ? { adminView: 'true' } : undefined;
  return $.api
    .playlists({ id: playlistId })
    .visibility.patch({ isPrivate }, { query })
    .then(unwrap);
}

export function reorderPlaylistSongs(playlistId: string, songIds: string[]): Promise<void> {
  return $.api
    .playlists({ id: playlistId })
    .reorder.patch({ songIds })
    .then(() => undefined);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export function fetchQueueState(): Promise<QueueState> {
  return $.api.player.queue.get().then(unwrap);
}

export function startPlayback(opts: {
  playlistId?: string;
  mode: 'sequential' | 'random';
  loop: LoopMode;
  startFromSongId?: string;
}): Promise<void> {
  return $.api.player.play
    .post(opts)
    .then(unwrap)
    .then(() => undefined);
}

export function skipTrack(): Promise<void> {
  return $.api.player.skip
    .post()
    .then(unwrap)
    .then(() => undefined);
}

export function leaveVoice(): Promise<void> {
  return $.api.player.leave
    .post()
    .then(unwrap)
    .then(() => undefined);
}

export function setLoopMode(mode: LoopMode): Promise<void> {
  return $.api.player.loop
    .post({ mode })
    .then(unwrap)
    .then(() => undefined);
}

export function shuffleQueue(): Promise<void> {
  return $.api.player.shuffle
    .post()
    .then(unwrap)
    .then(() => undefined);
}

export function unshuffleQueue(): Promise<void> {
  return $.api.player.unshuffle
    .post()
    .then(unwrap)
    .then(() => undefined);
}

export function clearQueue(): Promise<void> {
  return $.api.player.clear
    .post()
    .then(unwrap)
    .then(() => undefined);
}

export function togglePause(): Promise<{ isPaused: boolean }> {
  return $.api.player['pause-toggle'].post().then(unwrap);
}

export function seek(positionMs: number): Promise<void> {
  return $.api.player.seek
    .post({ position: positionMs })
    .then(unwrap)
    .then(() => undefined);
}

export function quickAddToQueue(url: string): Promise<{
  message: string;
  song: { title: string; duration: number; thumbnailUrl: string; requestedBy: string };
}> {
  return $.api.player['quick-add'].post({ url }).then(unwrap);
}

export function quickAddPlaylistToQueue(
  url: string,
  maxVideos?: number
): Promise<{
  message: string;
  playlistTitle: string;
  totalVideos: number;
  queuedCount: number;
  songs: { title: string; duration: number; thumbnailUrl: string; requestedBy: string }[];
}> {
  return $.api.player['quick-add-playlist']
    .post({
      url,
      ...(maxVideos && { maxVideos }),
    })
    .then(unwrap);
}

export function addToPriorityQueue(songId: string): Promise<{
  message: string;
  song: { title: string; duration: number; thumbnailUrl: string; requestedBy: string };
}> {
  return $.api.player['add-to-priority'].post({ songId }).then(unwrap);
}

export function overridePlay(url: string): Promise<{
  message: string;
  song: { title: string; duration: number; thumbnailUrl: string; requestedBy: string };
}> {
  return $.api.player.override.post({ url }).then(unwrap);
}

export function removeQueueSong(songId: string): Promise<void> {
  return $.api.player
    .queue({ songId: encodeURIComponent(songId) })
    .delete()
    .then(unwrap)
    .then(() => undefined);
}

export function promoteQueueSong(songId: string): Promise<void> {
  return $.api.player
    .queue({ songId: encodeURIComponent(songId) })
    .promote.post()
    .then(unwrap)
    .then(() => undefined);
}

export function demoteQueueSong(songId: string): Promise<void> {
  return $.api.player
    .queue({ songId: encodeURIComponent(songId) })
    .demote.post()
    .then(unwrap)
    .then(() => undefined);
}

export function reorderQueueSongs(songIds: string[], target?: 'queue' | 'priority'): Promise<void> {
  return $.api.player.queue.reorder
    .patch({ songIds, target })
    .then(unwrap)
    .then(() => undefined);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function fetchSetupStatus(): Promise<SetupStatus> {
  return $.api.setup.status.get().then(unwrap);
}

export function fetchSetupGuilds(): Promise<{ guilds: SetupGuild[] }> {
  return $.api.setup.guilds.get().then(unwrap);
}

export function fetchSetupRoles(guildId: string): Promise<{ roles: SetupRole[] }> {
  return $.api.setup.roles.get({ query: { guildId } }).then(unwrap);
}

export function fetchSetupChannels(guildId: string): Promise<{ channels: SetupChannel[] }> {
  return $.api.setup.channels.get({ query: { guildId } }).then(unwrap);
}

export interface CompleteSetupPayload {
  guildId: string;
  adminRoleIds: string;
  voiceIdleTimeoutMinutes: number;
  afkNotificationChannelId?: string | null;
  requestNotificationChannelId?: string | null;
  publicUrl?: string | null;
  enabledSources?: string;
}

export function completeSetup(data: CompleteSetupPayload): Promise<{ success: boolean }> {
  return $.api.setup.complete.post(data as any).then(unwrap) as Promise<{ success: boolean }>;
}

// ---------------------------------------------------------------------------
// General Settings
// ---------------------------------------------------------------------------

export function fetchGeneralSettings(): Promise<GeneralSettings> {
  return $.api.settings.general.get().then(unwrap);
}

export type GeneralSettingsUpdate = Partial<
  Pick<
    GeneralSettings,
    | 'adminRoleIds'
    | 'voiceIdleTimeoutMinutes'
    | 'afkNotificationChannelId'
    | 'requestNotificationChannelId'
    | 'notifyOnApproved'
    | 'notifyOnDenied'
    | 'publicUrl'
    | 'enabledSources'
  >
>;

export function updateGeneralSettings(data: GeneralSettingsUpdate): Promise<GeneralSettings> {
  return $.api.settings.general.patch(data).then(unwrap);
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface PermissionsResponse {
  mapping: Record<string, string[]>;
  roles: { id: string; name: string; color: number }[];
  categories: { label: string; actions: string[] }[];
  labels: Record<string, string>;
}

export function fetchPermissions(): Promise<PermissionsResponse> {
  return $.api.permissions.get().then(unwrap);
}

export function updatePermission(
  action: string,
  roleIds: string[]
): Promise<{ action: string; roleIds: string[] }> {
  return $.api.permissions.patch({ action, roleIds }).then(unwrap);
}

export interface MyPermissionsResponse {
  permissions: string[];
}

export function fetchMyPermissions(): Promise<MyPermissionsResponse> {
  return $.api.permissions.me.get().then(unwrap);
}
