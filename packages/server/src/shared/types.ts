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
  youtubeUrl: string;
  youtubeId: string;
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
  notificationChannelId: string | null;
  publicUrl: string | null;
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
}
