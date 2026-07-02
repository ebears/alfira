import { configureApiClient } from '@alfira-bot/server/shared/api';
import { client } from './client';

// Configure the shared API service with the web client
configureApiClient(client);

export type {
  GeneralSettings,
  SetupChannel,
  SetupGuild,
  SetupRole,
  SetupStatus,
} from '@alfira-bot/server/shared';

export type {
  CompleteSetupPayload,
  GeneralSettingsUpdate,
  PermissionsResponse,
} from '@alfira-bot/server/shared/api';
// ---------------------------------------------------------------------------
// Re-export everything from shared API with web-compatible names
// ---------------------------------------------------------------------------
export {
  addSongToPlaylist,
  addToPriorityQueue,
  clearQueue,
  completeSetup,
  createPlaylist,
  createSong as addSong,
  deletePlaylist,
  deleteSong,
  fetchGeneralSettings,
  fetchLogout as logout,
  // Auth
  fetchMe as getMe,
  fetchPermissions,
  fetchPlaylistPage as getPlaylistPage,
  // Playlists
  fetchPlaylists as getPlaylists,
  fetchPlaylistsPage as getPlaylistsPage,
  // Player
  fetchQueueState,
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
  leaveVoice,
  overridePlay,
  quickAddPlaylistToQueue,
  quickAddToQueue,
  removeSongFromPlaylist,
  renamePlaylist,
  setLoopMode,
  shuffleQueue,
  skipTrack,
  startPlayback,
  togglePause,
  togglePlaylistVisibility,
  unshuffleQueue,
  updateGeneralSettings,
  updatePermission,
} from '@alfira-bot/server/shared/api';
