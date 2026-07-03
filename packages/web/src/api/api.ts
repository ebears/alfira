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
  approveRequest,
  type CreateRequestResult,
  cancelRequest,
  completeSetup,
  createPlaylist,
  createRequest,
  deletePlaylist,
  deleteSong,
  denyRequest,
  type FetchRequestsResult,
  fetchGeneralSettings,
  fetchLogout as logout,
  // Auth
  fetchMe as getMe,
  fetchMyPermissions,
  fetchPermissions,
  fetchPlaylistPage as getPlaylistPage,
  // Playlists
  fetchPlaylistsPage as getPlaylistsPage,
  // Requests
  fetchRequests,
  // Setup
  fetchSetupChannels,
  fetchSetupGuilds,
  fetchSetupRoles,
  fetchSetupStatus,
  // Songs
  fetchSongsPage as getSongsPage,
  // Version
  fetchVersion,
  overridePlay,
  previewRequest,
  quickAddPlaylistToQueue,
  quickAddToQueue,
  type RequestCreateData,
  removeSongFromPlaylist,
  renamePlaylist,
  startPlayback,
  togglePlaylistVisibility,
  updateGeneralSettings,
  updatePermission,
} from '@alfira-bot/server/shared/api';
