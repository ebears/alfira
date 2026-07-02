import { configureApiClient } from '@alfira-bot/server/shared/api';
import { client } from './client';

// Configure the shared API service with the web client
configureApiClient(client);

export type {
  GeneralSettings,
  SetupChannel,
  SetupGuild,
  SetupRole,
} from '@alfira-bot/server/shared';

export type { MyPermissionsResponse, PermissionsResponse } from '@alfira-bot/server/shared/api';
// ---------------------------------------------------------------------------
// Re-export everything from shared API with web-compatible names
// ---------------------------------------------------------------------------
export {
  addSongToPlaylist,
  addToPriorityQueue,
  completeSetup,
  createPlaylist,
  createSong as addSong,
  deletePlaylist,
  deleteSong,
  fetchGeneralSettings,
  fetchLogout as logout,
  // Auth
  fetchMe as getMe,
  fetchMyPermissions,
  fetchPermissions,
  fetchPlaylistPage as getPlaylistPage,
  // Playlists
  fetchPlaylists as getPlaylists,
  fetchPlaylistsPage as getPlaylistsPage,
  // Setup
  fetchSetupChannels,
  fetchSetupGuilds,
  fetchSetupRoles,
  fetchSetupStatus,
  // Songs
  fetchSongsPage as getSongsPage,
  // Version
  fetchVersion,
  importPlaylist,
  overridePlay,
  quickAddPlaylistToQueue,
  quickAddToQueue,
  removeSongFromPlaylist,
  renamePlaylist,
  startPlayback,
  togglePlaylistVisibility,
  updateGeneralSettings,
  updatePermission,
} from '@alfira-bot/server/shared/api';
