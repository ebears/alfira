// ---------------------------------------------------------------------------
// API barrel — everything components need to call the server.
//
// Runtime functions come from the Eden-backed routes module.
// Types still come from the server's shared/api.ts (which is now type-only).
// ---------------------------------------------------------------------------

export type { GeneralSettings, SetupChannel, SetupGuild, SetupRole } from '@alfira/server/shared';

export type {
  BulkEditData,
  FetchSongsOptions,
  MyPermissionsResponse,
  PermissionsResponse,
} from '@alfira/server/shared/api';

export { ApiError, trySilentRefresh } from './eden';

export {
  addSongToPlaylist,
  addToPriorityQueue,
  approveRequest,
  bulkDeleteSongs,
  bulkEditSongs,
  bulkRemoveSongsFromPlaylist,
  bulkTagSongs,
  cancelRequest,
  clearQueue,
  completeSetup,
  createPlaylist,
  createRequest,
  deletePlaylist,
  deleteSong,
  deleteTag,
  demoteQueueSong,
  denyRequest,
  fetchGeneralSettings,
  fetchLogout as logout,
  fetchMe as getMe,
  fetchMyPermissions,
  fetchPermissions,
  fetchPlaylistPage as getPlaylistPage,
  fetchPlaylistsPage as getPlaylistsPage,
  fetchQueueState,
  fetchRequests,
  fetchSetupChannels,
  fetchSetupGuilds,
  fetchSetupRoles,
  fetchSetupStatus,
  fetchSongsPage as getSongsPage,
  fetchTagSongs,
  fetchTags,
  fetchVersion,
  leaveVoice,
  overridePlay,
  previewRequest,
  promoteQueueSong,
  quickAddPlaylistToQueue,
  quickAddToQueue,
  removeQueueSong,
  removeSongFromPlaylist,
  renamePlaylist,
  reorderPlaylistSongs,
  reorderQueueSongs,
  seek,
  setLoopMode,
  shuffleQueue,
  skipTrack,
  startPlayback,
  togglePause,
  togglePlaylistVisibility,
  unshuffleQueue,
  updateGeneralSettings,
  updatePermission,
  updatePlaylistTag,
  updateSong,
  updateTag,
} from './routes';

export type {
  CompleteSetupPayload,
  CreateRequestResult,
  FetchRequestsResult,
  GeneralSettingsUpdate,
  RequestCreateData,
  SongUpdateData,
  TagItem,
} from './routes';
