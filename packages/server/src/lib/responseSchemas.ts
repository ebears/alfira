// ---------------------------------------------------------------------------
// Shared Elysia response schemas for Eden type inference.
//
// These t.Object / t.Array / t.* schemas describe the JSON shapes returned
// by route handlers. Adding them as the third argument to .get()/.post()/etc.
// enables Eden to infer full response types without manual interface
// definitions. Error responses (4xx/5xx) are returned as raw Response objects
// and bypass schema validation — they don't need schemas here.
// ---------------------------------------------------------------------------

import { t } from 'elysia';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const PaginationMeta = t.Object({
  page: t.Number(),
  limit: t.Number(),
  total: t.Number(),
  totalPages: t.Number(),
});

// ---------------------------------------------------------------------------
// Song
// ---------------------------------------------------------------------------

export const Song = t.Object({
  id: t.String(),
  title: t.String(),
  sourceUrl: t.String(),
  sourceId: t.String(),
  duration: t.Number(),
  thumbnailUrl: t.String(),
  addedBy: t.String(),
  addedByDisplayName: t.Optional(t.String()),
  nickname: t.Nullable(t.String()),
  artist: t.Nullable(t.String()),
  album: t.Nullable(t.String()),
  artwork: t.Nullable(t.String()),
  tags: t.Optional(t.Array(t.String())),
  volumeBoost: t.Nullable(t.Number()),
  createdAt: t.String(),
});

// ---------------------------------------------------------------------------
// QueuedSong (Song + requestedBy)
// ---------------------------------------------------------------------------

const QueuedSong = t.Object({
  id: t.String(),
  title: t.String(),
  sourceUrl: t.String(),
  sourceId: t.String(),
  duration: t.Number(),
  thumbnailUrl: t.String(),
  addedBy: t.String(),
  addedByDisplayName: t.Optional(t.String()),
  nickname: t.Nullable(t.String()),
  artist: t.Nullable(t.String()),
  album: t.Nullable(t.String()),
  artwork: t.Nullable(t.String()),
  tags: t.Optional(t.Array(t.String())),
  volumeBoost: t.Nullable(t.Number()),
  createdAt: t.String(),
  requestedBy: t.String(),
});

// ---------------------------------------------------------------------------
// QueueState
// ---------------------------------------------------------------------------

export const QueueState = t.Object({
  isPlaying: t.Boolean(),
  isPaused: t.Boolean(),
  isConnectedToVoice: t.Boolean(),
  loopMode: t.Union([t.Literal('off'), t.Literal('song'), t.Literal('queue')]),
  isShuffled: t.Boolean(),
  currentSong: t.Nullable(QueuedSong),
  priorityQueue: t.Array(QueuedSong),
  queue: t.Array(QueuedSong),
  trackStartedAt: t.Nullable(t.Number()),
  nextTrack: t.Nullable(QueuedSong),
  timescaleSpeed: t.Optional(t.Number()),
  nodeLinkPosition: t.Nullable(t.Number()),
  nodeLinkTime: t.Nullable(t.Number()),
});

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export const TagItem = t.Object({
  canonicalName: t.String(),
  nameLower: t.String(),
  color: t.Nullable(t.String()),
});

// ---------------------------------------------------------------------------
// Audio filter settings (shared shapes for GET / PATCH responses)
// ---------------------------------------------------------------------------

export const CompressorSettings = t.Object({
  enabled: t.Boolean(),
  threshold: t.Number(),
  ratio: t.Number(),
  attack: t.Number(),
  release: t.Number(),
  gain: t.Number(),
});

export const EqualizerSettings = t.Object({
  bands: t.Array(t.Integer({ minimum: 0, maximum: 100 }), { minLength: 15, maxLength: 15 }),
  enabled: t.Boolean(),
});

export const KaraokeSettings = t.Object({
  enabled: t.Boolean(),
  level: t.Number(),
  monoLevel: t.Number(),
  filterBand: t.Number(),
  filterWidth: t.Number(),
});

export const TimescaleSettings = t.Object({
  enabled: t.Boolean(),
  speed: t.Number(),
  pitch: t.Number(),
  rate: t.Number(),
});

export const TremoloSettings = t.Object({
  enabled: t.Boolean(),
  frequency: t.Number(),
  depth: t.Number(),
});

export const VibratoSettings = t.Object({
  enabled: t.Boolean(),
  frequency: t.Number(),
  depth: t.Number(),
});

export const RotationSettings = t.Object({
  enabled: t.Boolean(),
  rotationHz: t.Number(),
});

export const DistortionSettings = t.Object({
  enabled: t.Boolean(),
  sinOffset: t.Number(),
  sinScale: t.Number(),
  cosOffset: t.Number(),
  cosScale: t.Number(),
  tanOffset: t.Number(),
  tanScale: t.Number(),
  offset: t.Number(),
  scale: t.Number(),
});

export const ChannelMixSettings = t.Object({
  enabled: t.Boolean(),
  leftToLeft: t.Number(),
  leftToRight: t.Number(),
  rightToLeft: t.Number(),
  rightToRight: t.Number(),
});

export const LowPassSettings = t.Object({
  enabled: t.Boolean(),
  smoothing: t.Number(),
});

export const FiltersData = t.Object({
  compressor: CompressorSettings,
  equalizer: EqualizerSettings,
  karaoke: KaraokeSettings,
  timescale: TimescaleSettings,
  tremolo: TremoloSettings,
  vibrato: VibratoSettings,
  rotation: RotationSettings,
  distortion: DistortionSettings,
  channelMix: ChannelMixSettings,
  lowPass: LowPassSettings,
});

// ---------------------------------------------------------------------------
// GeneralSettings
// ---------------------------------------------------------------------------

const AvailableSource = t.Object({
  key: t.String(),
  displayName: t.String(),
  requiresCredentials: t.Boolean(),
  helpText: t.Nullable(t.String()),
});

export const GeneralSettings = t.Object({
  guildId: t.Nullable(t.String()),
  setupCompleted: t.Boolean(),
  adminRoleIds: t.String(),
  voiceIdleTimeoutMinutes: t.Number(),
  afkNotificationChannelId: t.Nullable(t.String()),
  requestNotificationChannelId: t.Nullable(t.String()),
  notifyOnApproved: t.Boolean(),
  notifyOnDenied: t.Boolean(),
  publicUrl: t.Nullable(t.String()),
  enabledSources: t.String(),
  availableSources: t.Array(AvailableSource),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export const SetupStatus = t.Object({
  setupCompleted: t.Boolean(),
  guildName: t.Nullable(t.String()),
  clientId: t.String(),
});

export const SetupGuild = t.Object({
  id: t.String(),
  name: t.String(),
  icon: t.Nullable(t.String()),
});

export const SetupRole = t.Object({
  id: t.String(),
  name: t.String(),
  color: t.Number(),
});

export const SetupChannel = t.Object({
  id: t.String(),
  name: t.String(),
});

// ---------------------------------------------------------------------------
// Request Preview
// ---------------------------------------------------------------------------

const PlaylistMetaSchema = t.Object({
  name: t.String(),
  videoCount: t.Number(),
  thumbnailUrl: t.Optional(t.Nullable(t.String())),
});

export const RequestPreview = t.Object({
  title: t.String(),
  sourceId: t.String(),
  duration: t.Number(),
  thumbnailUrl: t.String(),
  sourceName: t.Nullable(t.String()),
  artist: t.Nullable(t.String()),
  artworkUrl: t.Nullable(t.String()),
  alreadyExists: t.Boolean(),
  isPlaylist: t.Boolean(),
  playlistMeta: t.Optional(PlaylistMetaSchema),
});

// ---------------------------------------------------------------------------
// Helpers for paginated responses
// ---------------------------------------------------------------------------

export function PaginatedResult<T extends ReturnType<typeof t.Object>>(itemSchema: T) {
  return t.Object({
    items: t.Array(itemSchema),
    pagination: PaginationMeta,
  });
}

// ---------------------------------------------------------------------------
// Playlist (abridged — used in list responses)
// ---------------------------------------------------------------------------

export const Playlist = t.Object({
  id: t.String(),
  name: t.String(),
  createdBy: t.String(),
  createdByDisplayName: t.Optional(t.String()),
  isPrivate: t.Boolean(),
  tagNameLower: t.Nullable(t.String()),
  createdAt: t.String(),
  _count: t.Optional(t.Object({ songs: t.Number() })),
  coverUrls: t.Optional(t.Array(t.String())),
});

// ---------------------------------------------------------------------------
// PlaylistSong entry + song (used in detail responses)
// ---------------------------------------------------------------------------

export const PlaylistSongEntry = t.Object({
  id: t.String(),
  playlistId: t.String(),
  songId: t.String(),
  position: t.Number(),
  song: Song,
});

// ---------------------------------------------------------------------------
// PlaylistDetail (playlist + songs + pagination)
// ---------------------------------------------------------------------------

export const PlaylistDetail = t.Object({
  id: t.String(),
  name: t.String(),
  createdBy: t.String(),
  createdByDisplayName: t.Optional(t.String()),
  isPrivate: t.Boolean(),
  tagNameLower: t.Nullable(t.String()),
  createdAt: t.String(),
  songs: t.Array(PlaylistSongEntry),
  pagination: PaginationMeta,
});

// ---------------------------------------------------------------------------
// Common mutation responses (used across multiple route groups)
// ---------------------------------------------------------------------------

export const MessageResponse = t.Object({
  message: t.String(),
});

// ---------------------------------------------------------------------------
// Player-specific mutation responses
// ---------------------------------------------------------------------------

export const PauseToggleResponse = t.Object({
  isPaused: t.Boolean(),
});

export const LoopModeResponse = t.Object({
  loopMode: t.Union([t.Literal('off'), t.Literal('song'), t.Literal('queue')]),
});

export const SongAddedResponse = t.Object({
  message: t.String(),
  song: QueuedSong,
});

export const PlaylistQueuedResponse = t.Object({
  message: t.String(),
  playlistTitle: t.String(),
  totalVideos: t.Number(),
  queuedCount: t.Number(),
  songs: t.Array(QueuedSong),
});

// ---------------------------------------------------------------------------
// Song bulk operation responses
// ---------------------------------------------------------------------------

export const BulkRemoveSongsResponse = t.Object({
  removed: t.Number(),
});

// ---------------------------------------------------------------------------
// Permissions response
// ---------------------------------------------------------------------------

export const MyPermissionsResponse = t.Object({
  permissions: t.Array(t.String()),
});

// ---------------------------------------------------------------------------
// SongRequest (for requests endpoints)
// ---------------------------------------------------------------------------

const PlaylistVideo = t.Object({
  id: t.String(),
  title: t.String(),
  duration: t.Number(),
  thumbnailUrl: t.Optional(t.Nullable(t.String())),
  artist: t.Optional(t.Nullable(t.String())),
  artworkUrl: t.Optional(t.Nullable(t.String())),
});

const PlaylistDataSchema = t.Object({
  name: t.String(),
  videoCount: t.Number(),
  thumbnailUrl: t.Optional(t.Nullable(t.String())),
  videos: t.Optional(t.Array(PlaylistVideo)),
});

export const SongRequest = t.Object({
  id: t.String(),
  sourceUrl: t.String(),
  sourceId: t.String(),
  title: t.String(),
  duration: t.Number(),
  thumbnailUrl: t.String(),
  artist: t.Nullable(t.String()),
  artworkUrl: t.Nullable(t.String()),
  sourceName: t.Nullable(t.String()),
  requestedBy: t.String(),
  requestedByDisplayName: t.Optional(t.String()),
  notifyDm: t.Boolean(),
  type: t.Union([t.Literal('track'), t.Literal('playlist')]),
  playlistData: t.Nullable(PlaylistDataSchema),
  status: t.Union([t.Literal('pending'), t.Literal('approved'), t.Literal('denied')]),
  reviewedBy: t.Nullable(t.String()),
  createdAt: t.String(),
  closedAt: t.Nullable(t.String()),
});

export const CreateRequestResult = t.Object({
  request: t.Optional(SongRequest),
  song: t.Optional(Song),
  songs: t.Optional(t.Array(Song)),
  autoApproved: t.Boolean(),
  importedCount: t.Optional(t.Number()),
  skippedCount: t.Optional(t.Number()),
  playlistTitle: t.Optional(t.String()),
});
