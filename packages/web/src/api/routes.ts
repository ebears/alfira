// ---------------------------------------------------------------------------
// Typed API functions — thin wrappers around the Eden Treaty client.
//
// Each function uses Eden's proxy chain for URL construction, then unwraps
// the { data, error } response: throws ApiError on error, returns data.
//
// Response and request types are inferred from the server's Elysia schemas
// (single source of truth in packages/server/src/shared/apiSchemas.ts) — do
// not annotate return types here unless the wrapper reshapes the payload.
// ---------------------------------------------------------------------------

import {
  type BulkEditData,
  type CompleteSetupPayload,
  type FetchSongsOptions,
  type GeneralSettingsUpdate,
  type LoopMode,
  type RequestCreateData,
  type SongUpdateData,
  type TagUpdateData,
} from '@alfira/server/shared';

import { apiErrorFromTreatyError, type TreatyError } from '../utils/api';
import { api } from './eden';

const $ = api;

// ---------------------------------------------------------------------------
// Response unwrapping
// ---------------------------------------------------------------------------

// Eden's TreatyResponse: success carries `data` + `error: null`, failure
// carries `data: null` + error details. `status`/`value` are `unknown` in
// Eden's types; the runtime shapes are narrowed in apiErrorFromTreatyError.
type TreatyResult<T> = { data: T; error: null } | { data: null; error: TreatyError };

function unwrap<T>(result: TreatyResult<T>): T {
  if (result.error) {
    throw apiErrorFromTreatyError(result.error);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export async function fetchVersion() {
  return unwrap(await $.api.version.get());
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function fetchMe() {
  const { user } = unwrap(await $.auth.me.get());
  return user;
}

// Deliberate exception to the "all wrappers unwrap" contract: logout is
// fire-and-forget — the local session is cleared even if server-side token
// revocation fails. Do not add `unwrap` here.
export async function fetchLogout(): Promise<void> {
  await $.auth.logout.post();
}

// ---------------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------------

export async function fetchSongsPage(page: number, limit = 30, opts?: FetchSongsOptions) {
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
  return unwrap(await $.api.songs.get({ query: Object.fromEntries(params) }));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export async function createRequest(data: RequestCreateData) {
  return unwrap(await $.api.requests.post(data));
}

export async function previewRequest(url: string) {
  return unwrap(await $.api.requests.preview.post({ url }));
}

export async function fetchRequests(
  page: number,
  limit = 30,
  opts?: { status?: string; mine?: boolean }
) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (opts?.status) {
    params.set('status', opts.status);
  }
  if (opts?.mine) {
    params.set('mine', 'true');
  }
  return unwrap(await $.api.requests.get({ query: Object.fromEntries(params) }));
}

export async function approveRequest(id: string) {
  return unwrap(await $.api.requests({ id }).patch({ status: 'approved' }));
}

export async function denyRequest(id: string) {
  return unwrap(await $.api.requests({ id }).patch({ status: 'denied' }));
}

export async function cancelRequest(id: string): Promise<void> {
  unwrap(await $.api.requests({ id }).delete());
}

// ---------------------------------------------------------------------------
// Songs — mutations
// ---------------------------------------------------------------------------

export async function deleteSong(id: string): Promise<void> {
  unwrap(await $.api.songs({ id }).delete());
}

export async function bulkDeleteSongs(ids: string[]) {
  return unwrap(await $.api.songs['bulk-delete'].post({ ids }));
}

export async function bulkTagSongs(ids: string[], tags: string[], mode: 'add' | 'set' = 'add') {
  return unwrap(await $.api.songs['bulk-tag'].post({ ids, tags, mode }));
}

export async function bulkEditSongs(ids: string[], data: BulkEditData) {
  return unwrap(await $.api.songs['bulk-edit'].post({ ids, ...data }));
}

export async function updateSong(id: string, data: SongUpdateData) {
  return unwrap(await $.api.songs({ id }).patch(data));
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function fetchTags() {
  const { tags } = unwrap(await $.api.tags.get());
  return tags;
}

export async function fetchTagSongs(nameLower: string) {
  const { songs } = unwrap(await $.api.tags({ nameLower }).songs.get());
  return songs;
}

export async function updateTag(nameLower: string, data: TagUpdateData) {
  return unwrap(await $.api.tags({ nameLower }).patch(data));
}

export async function deleteTag(nameLower: string) {
  return unwrap(await $.api.tags({ nameLower }).delete());
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export async function createPlaylist(name: string, tagNameLower?: string) {
  return unwrap(await $.api.playlists.post({ name, ...(tagNameLower && { tagNameLower }) }));
}

export async function fetchPlaylistsPage(adminView = false, page: number, limit = 30) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (adminView) {
    params.set('adminView', 'true');
  }
  return unwrap(await $.api.playlists.get({ query: Object.fromEntries(params) }));
}

export async function fetchPlaylistPage(
  id: string,
  adminView = false,
  page: number,
  limit = 30,
  opts?: FetchSongsOptions
) {
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
  return unwrap(await $.api.playlists({ id }).get({ query: Object.fromEntries(params) }));
}

export async function renamePlaylist(id: string, name: string) {
  return unwrap(await $.api.playlists({ id }).patch({ name }));
}

export async function updatePlaylistTag(id: string, tagNameLower: string | null) {
  return unwrap(await $.api.playlists({ id }).patch({ tagNameLower }));
}

export async function deletePlaylist(id: string): Promise<void> {
  unwrap(await $.api.playlists({ id }).delete());
}

export async function addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
  unwrap(await $.api.playlists({ id: playlistId }).songs.post({ songId }));
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  unwrap(await $.api.playlists({ id: playlistId }).songs({ songId }).delete());
}

export async function bulkRemoveSongsFromPlaylist(playlistId: string, songIds: string[]) {
  return unwrap(await $.api.playlists({ id: playlistId }).songs['bulk-remove'].post({ songIds }));
}

export async function togglePlaylistVisibility(
  playlistId: string,
  isPrivate: boolean,
  adminView = false
) {
  const query = adminView ? { adminView: 'true' } : undefined;
  return unwrap(
    await $.api.playlists({ id: playlistId }).visibility.patch({ isPrivate }, { query })
  );
}

export async function reorderPlaylistSongs(playlistId: string, songIds: string[]): Promise<void> {
  unwrap(await $.api.playlists({ id: playlistId }).reorder.patch({ songIds }));
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export async function fetchQueueState() {
  return unwrap(await $.api.player.queue.get());
}

export async function startPlayback(opts: {
  playlistId?: string;
  mode: 'sequential' | 'random';
  loop: LoopMode;
  startFromSongId?: string;
}): Promise<void> {
  unwrap(await $.api.player.play.post(opts));
}

export async function skipTrack(): Promise<void> {
  unwrap(await $.api.player.skip.post());
}

export async function leaveVoice(): Promise<void> {
  unwrap(await $.api.player.leave.post());
}

export async function setLoopMode(mode: LoopMode): Promise<void> {
  unwrap(await $.api.player.loop.post({ mode }));
}

export async function shuffleQueue(): Promise<void> {
  unwrap(await $.api.player.shuffle.post());
}

export async function unshuffleQueue(): Promise<void> {
  unwrap(await $.api.player.unshuffle.post());
}

export async function clearQueue(): Promise<void> {
  unwrap(await $.api.player.clear.post());
}

export async function togglePause() {
  return unwrap(await $.api.player['pause-toggle'].post());
}

export async function seek(positionMs: number): Promise<void> {
  unwrap(await $.api.player.seek.post({ position: positionMs }));
}

export async function quickAddToQueue(url: string) {
  return unwrap(await $.api.player['quick-add'].post({ url }));
}

export async function quickAddPlaylistToQueue(url: string, maxVideos?: number) {
  return unwrap(
    await $.api.player['quick-add-playlist'].post({
      url,
      ...(maxVideos && { maxVideos }),
    })
  );
}

export async function addToPriorityQueue(songId: string) {
  return unwrap(await $.api.player['add-to-priority'].post({ songId }));
}

export async function overridePlay(url: string) {
  return unwrap(await $.api.player.override.post({ url }));
}

export async function removeQueueSong(songId: string): Promise<void> {
  unwrap(await $.api.player.queue({ songId: encodeURIComponent(songId) }).delete());
}

export async function promoteQueueSong(songId: string): Promise<void> {
  unwrap(await $.api.player.queue({ songId: encodeURIComponent(songId) }).promote.post());
}

export async function demoteQueueSong(songId: string): Promise<void> {
  unwrap(await $.api.player.queue({ songId: encodeURIComponent(songId) }).demote.post());
}

export async function reorderQueueSongs(
  songIds: string[],
  target?: 'queue' | 'priority'
): Promise<void> {
  unwrap(await $.api.player.queue.reorder.patch({ songIds, target }));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function fetchSetupStatus() {
  return unwrap(await $.api.setup.status.get());
}

export async function fetchSetupGuilds() {
  return unwrap(await $.api.setup.guilds.get());
}

export async function fetchSetupRoles(guildId: string) {
  return unwrap(await $.api.setup.roles.get({ query: { guildId } }));
}

export async function fetchSetupChannels(guildId: string) {
  return unwrap(await $.api.setup.channels.get({ query: { guildId } }));
}

export async function completeSetup(data: CompleteSetupPayload) {
  return unwrap(await $.api.setup.complete.post(data));
}

// ---------------------------------------------------------------------------
// General Settings
// ---------------------------------------------------------------------------

export async function fetchGeneralSettings() {
  return unwrap(await $.api.settings.general.get());
}

export async function updateGeneralSettings(data: GeneralSettingsUpdate) {
  return unwrap(await $.api.settings.general.patch(data));
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function fetchPermissions() {
  return unwrap(await $.api.permissions.get());
}

export async function updatePermission(action: string, roleIds: string[]) {
  return unwrap(await $.api.permissions.patch({ action, roleIds }));
}

export async function fetchMyPermissions() {
  return unwrap(await $.api.permissions.me.get());
}
