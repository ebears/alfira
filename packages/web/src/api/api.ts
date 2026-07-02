import { configureApiClient } from '@alfira-bot/server/shared/api';
import { client } from './client';

// Configure the shared API service with the web client
configureApiClient(client);

// ---------------------------------------------------------------------------
// Re-export everything from shared API with web-compatible names
// ---------------------------------------------------------------------------
export {
  addSongToPlaylist,
  addToPriorityQueue,
  clearQueue,
  createPlaylist,
  createSong as addSong,
  deletePlaylist,
  deleteSong,
  fetchLogout as logout,
  // Auth
  fetchMe as getMe,
  fetchPlaylistPage as getPlaylistPage,
  // Playlists
  fetchPlaylists as getPlaylists,
  fetchPlaylistsPage as getPlaylistsPage,
  // Player
  fetchQueueState,
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
} from '@alfira-bot/server/shared/api';
