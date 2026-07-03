// ---------------------------------------------------------------------------
// @alfira-bot/shared — types
//
// This is the single source of truth for types that cross package boundaries.
// Both the bot and the API import from here. Never duplicate these types.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Song
//
// Matches the database schema exactly. This is what the API returns and what
// Drizzle queries produce. It does NOT include queue-time properties like
// requestedBy — use QueuedSong for that.
// ---------------------------------------------------------------------------
export interface Song {
  id: string;
  title: string;
  sourceUrl: string;
  sourceId: string;
  duration: number; // seconds
  thumbnailUrl: string;
  addedBy: string; // Discord user ID
  addedByDisplayName?: string; // Resolved Discord display name (not persisted, populated at query time)
  nickname?: string | null; // Custom display name for the song
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
  createdAt: string; // ISO 8601 string (JSON wire format)
}

// ---------------------------------------------------------------------------
// QueuedSong
//
// A Song that has been placed into the GuildPlayer's queue. Extends Song with
// requestedBy (the display name of the Discord member who queued it), which
// is a runtime property that is never persisted to the database.
// ---------------------------------------------------------------------------
export interface QueuedSong extends Song {
  requestedBy: string;
  isSeekable?: boolean;
}

// ---------------------------------------------------------------------------
// LoopMode
//
// off   — Queue plays through once, then stops.
// song  — Current song repeats until explicitly skipped.
// queue — When the last song finishes the queue resets and replays.
// ---------------------------------------------------------------------------
export type LoopMode = 'off' | 'song' | 'queue';

// ---------------------------------------------------------------------------
// CompressorSettings
//
// Guild-level audio compressor configuration. Applied to NodeLink on playback.
// ---------------------------------------------------------------------------
export interface CompressorSettings {
  enabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
}

// ---------------------------------------------------------------------------
// EqualizerSettings
//
// Guild-level 15-band equalizer configuration. Applied to NodeLink on playback.
// ---------------------------------------------------------------------------
export interface EqualizerSettings {
  bands: number[]; // length 15, values 0–100, 50 = neutral (0 dB)
}

// ---------------------------------------------------------------------------
// GeneralSettings
//
// Guild-level general configuration. Stored in guildSettings table,
// configured via the setup wizard and the Admin Settings page.
// ---------------------------------------------------------------------------
export interface GeneralSettings {
  guildId: string | null;
  setupCompleted: boolean;
  adminRoleIds: string;
  voiceIdleTimeoutMinutes: number;
  afkNotificationChannelId: string | null;
  requestNotificationChannelId: string | null;
  notifyOnApproved: boolean;
  notifyOnDenied: boolean;
  publicUrl: string | null;
  enabledSources: string;
  availableSources: {
    key: string;
    displayName: string;
    requiresCredentials: boolean;
    helpText: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// SetupStatus
//
// Returned by GET /api/setup/status to tell the frontend whether to show
// the setup wizard.
// ---------------------------------------------------------------------------
export interface SetupStatus {
  setupCompleted: boolean;
  guildName: string | null;
  clientId: string;
}

// ---------------------------------------------------------------------------
// SetupRole
//
// A simplified role object returned by the setup API for the role picker.
// ---------------------------------------------------------------------------
export interface SetupRole {
  id: string;
  name: string;
  color: number;
}

// ---------------------------------------------------------------------------
// SetupChannel
//
// A simplified text-channel object returned by the setup API for the
// channel picker.
// ---------------------------------------------------------------------------
export interface SetupChannel {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// SetupGuild
//
// A simplified guild object returned by the setup API for the guild picker.
// ---------------------------------------------------------------------------
export interface SetupGuild {
  id: string;
  name: string;
  icon: string | null;
}

// ---------------------------------------------------------------------------
// QueueState
//
// A snapshot of the GuildPlayer's current state. This is the payload for
// GET /api/player/queue and the player:update event.
// ---------------------------------------------------------------------------
export interface QueueState {
  isPlaying: boolean;
  isPaused: boolean;
  isConnectedToVoice: boolean; // True when bot is connected to a voice channel
  loopMode: LoopMode;
  isShuffled: boolean;
  currentSong: QueuedSong | null;
  priorityQueue: QueuedSong[]; // Songs added via Quick Add or "Add to Queue" - play before regular queue
  queue: QueuedSong[];
  trackStartedAt: number | null; // Unix ms timestamp, null when not playing
  nextTrack: QueuedSong | null; // The next track being preloaded for gapless playback
  compressorSettings?: CompressorSettings | null;
}

// ---------------------------------------------------------------------------
// Playlist / PlaylistSong
//
// Match the database schema.
// ---------------------------------------------------------------------------
export interface Playlist {
  id: string;
  name: string;
  createdBy: string;
  createdByDisplayName?: string;
  isPrivate: boolean;
  tagNameLower?: string | null;
  createdAt: string; // ISO 8601 string (JSON wire format)
  songs?: { id: string; playlistId: string; songId: string; position: number; song?: Song }[];
  _count?: { songs: number };
}

// ---------------------------------------------------------------------------
// PlaylistDetail
//
// A Playlist with its songs fully populated. Used by GET /api/playlists/:id
// ---------------------------------------------------------------------------
export interface PlaylistDetail extends Omit<Playlist, 'songs'> {
  songs: { id: string; playlistId: string; songId: string; position: number; song: Song }[];
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// User
//
// Represents an authenticated Discord user. Returned by GET /auth/me
// ---------------------------------------------------------------------------
export interface User {
  discordId: string;
  username: string;
  avatar: string | null;
  isAdmin: boolean;
  /** Temporarily granted during first-run setup before admin roles are configured. */
  isSetupAdmin?: boolean;
  /** Discord role IDs the user has in the guild. Used for granular permission checks. */
  roles?: string[];
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Granular permission actions that can be delegated to non-admin roles. */
export type PermissionAction =
  | 'songs.edit'
  | 'songs.delete'
  | 'songs.import'
  | 'requests.autoapprove'
  | 'queue.clear'
  | 'queue.shuffle'
  | 'queue.quickadd'
  | 'queue.manage'
  | 'tags.manage'
  | 'audio.manage';

/** Human-readable labels for each permission action. */
export const PERMISSION_LABELS: Record<PermissionAction, string> = {
  'songs.edit': 'Edit song metadata',
  'songs.delete': 'Delete songs',
  'songs.import': 'Import external playlists',
  'requests.autoapprove': 'Auto-approved song requests',
  'queue.clear': 'Clear the queue',
  'queue.shuffle': 'Shuffle / unshuffle queue',
  'queue.quickadd': 'Quick-add external URLs',
  'queue.manage': 'Add to Up Next / override',
  'tags.manage': 'Manage tags',
  'audio.manage': 'Audio settings (EQ & compressor)',
};

/** Categories for grouping permissions in the UI. */
export const PERMISSION_CATEGORIES: { label: string; actions: PermissionAction[] }[] = [
  {
    label: 'Library',
    actions: ['songs.edit', 'songs.delete', 'songs.import', 'requests.autoapprove'],
  },
  {
    label: 'Playback',
    actions: ['queue.clear', 'queue.shuffle', 'queue.quickadd', 'queue.manage'],
  },
  {
    label: 'Management',
    actions: ['tags.manage', 'audio.manage'],
  },
];

// ---------------------------------------------------------------------------
// Song Requests
// ---------------------------------------------------------------------------

export interface SongRequestTrack {
  id: string;
  sourceUrl: string;
  sourceId: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  artist: string | null;
  artworkUrl: string | null;
  sourceName: string | null;
  requestedBy: string;
  requestedByDisplayName?: string;
  notifyDm: boolean;
  type: 'track';
  playlistData: null;
  status: 'pending' | 'approved' | 'denied';
  reviewedBy: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface SongRequestPlaylist {
  id: string;
  sourceUrl: string;
  sourceId: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  artist: string | null;
  artworkUrl: string | null;
  sourceName: string | null;
  requestedBy: string;
  requestedByDisplayName?: string;
  notifyDm: boolean;
  type: 'playlist';
  playlistData: {
    name: string;
    videoCount: number;
    thumbnailUrl?: string | null;
    videos?: Array<{
      id: string;
      title: string;
      duration: number;
      thumbnailUrl?: string | null;
      artist?: string | null;
      artworkUrl?: string | null;
    }>;
  } | null;
  status: 'pending' | 'approved' | 'denied';
  reviewedBy: string | null;
  createdAt: string;
  closedAt: string | null;
}

export type SongRequest = SongRequestTrack | SongRequestPlaylist;

export interface RequestPreview {
  title: string;
  sourceId: string;
  duration: number;
  thumbnailUrl: string;
  sourceName: string | null;
  artist: string | null;
  artworkUrl: string | null;
  alreadyExists: boolean;
  existingSong?: unknown;
  isPlaylist: boolean;
  playlistMeta?: {
    name: string;
    videoCount: number;
    thumbnailUrl?: string | null;
  };
}
