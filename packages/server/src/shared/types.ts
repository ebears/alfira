// ---------------------------------------------------------------------------
// @alfira/shared — types
//
// This is the single source of truth for types that cross package boundaries.
// Both the bot and the API import from here. Never duplicate these types.
//
// Wire types (anything sent over HTTP or the WebSocket) are DERIVED from the
// Elysia schemas in ./apiSchemas via `typeof Schema.static` — edit the schema,
// never a type alias here. Hand-written types are reserved for internal
// shapes that never cross the wire (or, like PaginatedResult<T>, are generic
// type-level helpers whose schema counterpart lives in ./apiSchemas).
// ---------------------------------------------------------------------------

import {
  type ChannelMixSettings as ChannelMixSettingsSchema,
  type CompressorSettings as CompressorSettingsSchema,
  type DistortionSettings as DistortionSettingsSchema,
  type EqualizerSettings as EqualizerSettingsSchema,
  type FiltersData as FiltersDataSchema,
  type GeneralSettings as GeneralSettingsSchema,
  type KaraokeSettings as KaraokeSettingsSchema,
  type LoopMode as LoopModeSchema,
  type LowPassSettings as LowPassSettingsSchema,
  type PaginationMeta as PaginationMetaSchema,
  type Playlist as PlaylistSchema,
  type PlaylistDetail as PlaylistDetailSchema,
  type QueueState as QueueStateSchema,
  type QueuedSong as QueuedSongSchema,
  type RequestPreview as RequestPreviewSchema,
  type RotationSettings as RotationSettingsSchema,
  type SetupChannel as SetupChannelSchema,
  type SetupGuild as SetupGuildSchema,
  type SetupRole as SetupRoleSchema,
  type SetupStatus as SetupStatusSchema,
  type Song as SongSchema,
  type SongRequest as SongRequestSchema,
  type TimescaleSettings as TimescaleSettingsSchema,
  type TremoloSettings as TremoloSettingsSchema,
  type User as UserSchema,
  type VibratoSettings as VibratoSettingsSchema,
} from './apiSchemas';

// ---------------------------------------------------------------------------
// Song
//
// Matches the database schema exactly. This is what the API returns and what
// Drizzle queries produce. It does NOT include queue-time properties like
// requestedBy — use QueuedSong for that.
// ---------------------------------------------------------------------------
export type Song = typeof SongSchema.static;

// ---------------------------------------------------------------------------
// QueuedSong
//
// A Song that has been placed into the GuildPlayer's queue. Extends Song with
// requestedBy (the display name of the Discord member who queued it), which
// is a runtime property that is never persisted to the database.
// ---------------------------------------------------------------------------
export type QueuedSong = typeof QueuedSongSchema.static;

// ---------------------------------------------------------------------------
// LoopMode
//
// off   — Queue plays through once, then stops.
// song  — Current song repeats until explicitly skipped.
// queue — When the last song finishes the queue resets and replays.
// ---------------------------------------------------------------------------
export type LoopMode = typeof LoopModeSchema.static;

// ---------------------------------------------------------------------------
// Audio filter settings
//
// Guild-level audio filter configuration. Applied to NodeLink on playback.
// EqualizerSettings.bands is length 15, values 0–100, 50 = neutral (0 dB).
// ---------------------------------------------------------------------------
export type CompressorSettings = typeof CompressorSettingsSchema.static;
export type EqualizerSettings = typeof EqualizerSettingsSchema.static;
export type KaraokeSettings = typeof KaraokeSettingsSchema.static;
export type TimescaleSettings = typeof TimescaleSettingsSchema.static;
export type TremoloSettings = typeof TremoloSettingsSchema.static;
export type VibratoSettings = typeof VibratoSettingsSchema.static;
export type RotationSettings = typeof RotationSettingsSchema.static;
export type DistortionSettings = typeof DistortionSettingsSchema.static;
export type ChannelMixSettings = typeof ChannelMixSettingsSchema.static;
export type LowPassSettings = typeof LowPassSettingsSchema.static;

// ---------------------------------------------------------------------------
// FiltersData
//
// Batched response from GET /api/settings/filters. Contains all filter
// settings in a single payload to reduce HTTP round-trips on page load.
// ---------------------------------------------------------------------------
export type FiltersData = typeof FiltersDataSchema.static;

// ---------------------------------------------------------------------------
// GeneralSettings
//
// Guild-level general configuration. Stored in guildSettings table,
// configured via the setup wizard and the Admin Settings page.
// ---------------------------------------------------------------------------
export type GeneralSettings = typeof GeneralSettingsSchema.static;

// ---------------------------------------------------------------------------
// Setup
//
// SetupStatus is returned by GET /api/setup/status to tell the frontend
// whether to show the setup wizard. SetupRole / SetupChannel / SetupGuild
// are simplified Discord objects returned by the setup API for the pickers.
// ---------------------------------------------------------------------------
export type SetupStatus = typeof SetupStatusSchema.static;
export type SetupRole = typeof SetupRoleSchema.static;
export type SetupChannel = typeof SetupChannelSchema.static;
export type SetupGuild = typeof SetupGuildSchema.static;

// ---------------------------------------------------------------------------
// QueueState
//
// A snapshot of the GuildPlayer's current state. This is the payload for
// GET /api/player/queue and the player:update event.
// ---------------------------------------------------------------------------
export type QueueState = typeof QueueStateSchema.static;

// ---------------------------------------------------------------------------
// Playlist / PlaylistDetail
//
// Playlist matches the database schema; PlaylistDetail is a Playlist with
// its songs fully populated (GET /api/playlists/:id).
// ---------------------------------------------------------------------------
export type Playlist = typeof PlaylistSchema.static;
export type PlaylistDetail = typeof PlaylistDetailSchema.static;

// ---------------------------------------------------------------------------
// Pagination
//
// PaginatedResult<T> is the type-level counterpart of the PaginatedResult()
// schema helper in ./apiSchemas — keep the two shapes in sync.
// ---------------------------------------------------------------------------
export type PaginationMeta = typeof PaginationMetaSchema.static;

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// User
//
// Represents an authenticated Discord user. Returned by GET /auth/me
// ---------------------------------------------------------------------------
export type User = typeof UserSchema.static;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Granular permission actions that can be delegated to non-admin roles. */
export type PermissionAction =
  | 'songs.edit'
  | 'songs.delete'
  | 'songs.import'
  | 'requests.autoapprove'
  | 'queue.quickadd'
  | 'queue.manage'
  | 'queue.override'
  | 'tags.manage'
  | 'audio.manage';

/** Human-readable labels for each permission action. */
export const PERMISSION_LABELS: Record<PermissionAction, string> = {
  'songs.edit': 'Edit song metadata',
  'songs.delete': 'Delete songs',
  'songs.import': 'Import external playlists',
  'requests.autoapprove': 'Auto-approved song requests',
  'queue.quickadd': 'Quick-add external URLs',
  'queue.manage': 'Manage queue (reorder, promote, remove, shuffle, clear)',
  'queue.override': 'Override playback',
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
    actions: ['queue.quickadd', 'queue.manage', 'queue.override'],
  },
  {
    label: 'Management',
    actions: ['tags.manage', 'audio.manage'],
  },
];

// ---------------------------------------------------------------------------
// Song Requests
// ---------------------------------------------------------------------------

export type SongRequest = typeof SongRequestSchema.static;

export type RequestPreview = typeof RequestPreviewSchema.static;
