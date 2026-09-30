// ---------------------------------------------------------------------------
// API wire schemas — the single source of truth for everything that crosses
// the HTTP boundary.
//
// These t.Object / t.Array / t.* schemas describe request bodies, query
// params, and response payloads. They serve three purposes:
//
// 1. Runtime validation (Elysia validates requests and responses — response
//    validation strips any field not declared here, so schemas define the
//    actual wire output).
// 2. Eden Treaty type inference on the web client (full request + response
//    types flow through `treaty<App>`).
// 3. Derived TypeScript types in shared/types.ts and shared/api.ts via
//    `typeof Schema.static` — never hand-write a wire type again.
//
// Error responses (4xx/5xx) are returned as raw Response objects or via the
// onError hook and bypass schema validation — they don't need schemas here.
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

export const MessageResponse = t.Object({
  message: t.String(),
});

/** Reusable primitives for schema composition (keeps nesting shallow). */
const StringArray = t.Array(t.String());
const IdsArray = t.Array(t.String(), { minLength: 1, maxLength: 5000 });

export function PaginatedResult<T extends ReturnType<typeof t.Object>>(itemSchema: T) {
  return t.Object({
    items: t.Array(itemSchema),
    pagination: PaginationMeta,
  });
}

// ---------------------------------------------------------------------------
// Loop mode
// ---------------------------------------------------------------------------

export const LoopMode = t.Union([t.Literal('off'), t.Literal('song'), t.Literal('queue')]);

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

export const QueuedSong = t.Object({
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
  /** False while a track is still resolving in NodeLink. */
  isSeekable: t.Optional(t.Boolean()),
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
// QueueState
//
// Payload for GET /api/player/queue and the player:update socket event
// (the socket event adds compressorSettings).
// ---------------------------------------------------------------------------

export const QueueState = t.Object({
  isPlaying: t.Boolean(),
  isPaused: t.Boolean(),
  isConnectedToVoice: t.Boolean(),
  loopMode: LoopMode,
  isShuffled: t.Boolean(),
  currentSong: t.Nullable(QueuedSong),
  priorityQueue: t.Array(QueuedSong),
  queue: t.Array(QueuedSong),
  trackStartedAt: t.Nullable(t.Number()),
  nextTrack: t.Nullable(QueuedSong),
  compressorSettings: t.Optional(t.Nullable(CompressorSettings)),
  timescaleSpeed: t.Optional(t.Number()),
  nodeLinkPosition: t.Nullable(t.Number()),
  nodeLinkTime: t.Nullable(t.Number()),
});

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

// Literal list (not t.Union(TAG_COLORS.map(...))) so the literal types survive
// Elysia's route type inference — a mapped array erases them to `never`.
export const TAG_COLOR_UNION = t.Union([
  t.Literal('orange'),
  t.Literal('sky'),
  t.Literal('emerald'),
  t.Literal('amber'),
  t.Literal('violet'),
]);

export const TagItem = t.Object({
  canonicalName: t.String(),
  nameLower: t.String(),
  color: t.Nullable(t.String()),
});

export const TagPatchSchema = t.Partial(
  t.Object({
    canonicalName: t.String({ minLength: 1 }),
    color: t.Nullable(TAG_COLOR_UNION),
  })
);

// ---------------------------------------------------------------------------
// Audio filter PATCH bodies
//
// Request-side counterparts of the filter settings schemas above, with
// runtime range constraints. Responses stay unconstrained so legacy
// out-of-range DB values can't 422 a read.
// ---------------------------------------------------------------------------

export const CompressorPatchSchema = t.Object({
  enabled: t.Boolean(),
  threshold: t.Integer({ minimum: -60, maximum: 0 }),
  ratio: t.Number({ minimum: 1, maximum: 20 }),
  attack: t.Integer({ minimum: 0, maximum: 100 }),
  release: t.Integer({ minimum: 10, maximum: 1000 }),
  gain: t.Integer({ minimum: 0, maximum: 24 }),
});

export const EqualizerPatchSchema = t.Object({
  bands: t.Array(t.Integer({ minimum: 0, maximum: 100 }), { minLength: 15, maxLength: 15 }),
  enabled: t.Boolean(),
});

export const KaraokePatchSchema = t.Object({
  enabled: t.Boolean(),
  level: t.Number({ minimum: 0, maximum: 1 }),
  monoLevel: t.Number({ minimum: 0, maximum: 1 }),
  filterBand: t.Number({ minimum: 50, maximum: 10000 }),
  filterWidth: t.Number({ minimum: 10, maximum: 10000 }),
});

export const TimescalePatchSchema = t.Object({
  enabled: t.Boolean(),
  speed: t.Number({ minimum: 0.5, maximum: 2 }),
  pitch: t.Number({ minimum: 0.5, maximum: 2 }),
  rate: t.Number({ minimum: 0.5, maximum: 2 }),
});

export const TremoloPatchSchema = t.Object({
  enabled: t.Boolean(),
  frequency: t.Number({ minimum: 0.1, maximum: 14 }),
  depth: t.Number({ minimum: 0, maximum: 1 }),
});

export const VibratoPatchSchema = t.Object({
  enabled: t.Boolean(),
  frequency: t.Number({ minimum: 0.1, maximum: 14 }),
  depth: t.Number({ minimum: 0, maximum: 1 }),
});

export const RotationPatchSchema = t.Object({
  enabled: t.Boolean(),
  rotationHz: t.Number({ minimum: 0, maximum: 1 }),
});

export const DistortionPatchSchema = t.Object({
  enabled: t.Boolean(),
  sinOffset: t.Number({ minimum: -1, maximum: 1 }),
  sinScale: t.Number({ minimum: 0, maximum: 5 }),
  cosOffset: t.Number({ minimum: -1, maximum: 1 }),
  cosScale: t.Number({ minimum: 0, maximum: 5 }),
  tanOffset: t.Number({ minimum: -1, maximum: 1 }),
  tanScale: t.Number({ minimum: 0, maximum: 5 }),
  offset: t.Number({ minimum: -1, maximum: 1 }),
  scale: t.Number({ minimum: 0, maximum: 5 }),
});

export const ChannelMixPatchSchema = t.Object({
  enabled: t.Boolean(),
  leftToLeft: t.Number({ minimum: 0, maximum: 1 }),
  leftToRight: t.Number({ minimum: 0, maximum: 1 }),
  rightToLeft: t.Number({ minimum: 0, maximum: 1 }),
  rightToRight: t.Number({ minimum: 0, maximum: 1 }),
});

export const LowPassPatchSchema = t.Object({
  enabled: t.Boolean(),
  smoothing: t.Number({ minimum: 0, maximum: 60 }),
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

export const GeneralSettingsPatchSchema = t.Partial(
  t.Object({
    adminRoleIds: t.String({ minLength: 1 }),
    voiceIdleTimeoutMinutes: t.Integer({ minimum: 1, maximum: 120 }),
    afkNotificationChannelId: t.Nullable(t.String()),
    requestNotificationChannelId: t.Nullable(t.String()),
    notifyOnApproved: t.Boolean(),
    notifyOnDenied: t.Boolean(),
    publicUrl: t.Nullable(t.String()),
    enabledSources: t.String({ minLength: 1 }),
  })
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const User = t.Object({
  discordId: t.String(),
  username: t.String(),
  avatar: t.Nullable(t.String()),
  isAdmin: t.Boolean(),
  /** Temporarily granted during first-run setup before admin roles are configured. */
  isSetupAdmin: t.Optional(t.Boolean()),
  /** Discord role IDs the user has in the guild. Used for granular permission checks. */
  roles: t.Optional(t.Array(t.String())),
});

export const UserResponse = t.Object({
  user: User,
});

export const VersionResponse = t.Object({
  version: t.String(),
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

export const SetupCompleteSchema = t.Object({
  guildId: t.String({ minLength: 1 }),
  adminRoleIds: t.String({ minLength: 1 }),
  voiceIdleTimeoutMinutes: t.Integer({ minimum: 1, maximum: 120 }),
  afkNotificationChannelId: t.Optional(t.Nullable(t.String())),
  requestNotificationChannelId: t.Optional(t.Nullable(t.String())),
  publicUrl: t.Optional(t.Nullable(t.String())),
  enabledSources: t.Optional(t.String()),
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

export const PreviewRequestSchema = t.Object({
  url: t.String(),
});

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
// Playlist request bodies
// ---------------------------------------------------------------------------

export const PlaylistCreateSchema = t.Object({
  name: t.String({ minLength: 1 }),
  tagNameLower: t.Optional(t.String()),
});

export const PlaylistPatchSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1 }),
    tagNameLower: t.Nullable(t.String()),
  })
);

export const PlaylistVisibilitySchema = t.Object({
  isPrivate: t.Optional(t.Boolean()),
  adminView: t.Optional(t.Boolean()),
});

export const PlaylistAddSongSchema = t.Object({
  songId: t.String(),
});

export const PlaylistRemoveSongsSchema = t.Object({
  songIds: IdsArray,
});

export const PlaylistReorderSchema = t.Object({
  songIds: IdsArray,
});

// ---------------------------------------------------------------------------
// Player-specific mutation responses
// ---------------------------------------------------------------------------

export const PauseToggleResponse = t.Object({
  isPaused: t.Boolean(),
});

export const LoopModeResponse = t.Object({
  loopMode: LoopMode,
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
// Player request bodies
// ---------------------------------------------------------------------------

export const PlaySchema = t.Object({
  playlistId: t.Optional(t.String()),
  mode: t.Optional(t.Union([t.Literal('sequential'), t.Literal('random')])),
  loop: t.Optional(LoopMode),
  startFromSongId: t.Optional(t.String()),
});

export const LoopSchema = t.Object({
  mode: LoopMode,
});

export const UrlSchema = t.Object({
  url: t.Optional(t.String()),
});

export const QuickAddPlaylistSchema = t.Object({
  url: t.Optional(t.String()),
  maxVideos: t.Optional(t.Number()),
});

export const SeekSchema = t.Object({
  position: t.Number(),
});

export const SongIdSchema = t.Object({
  songId: t.String(),
});

export const ReorderSchema = t.Object({
  songIds: t.Array(t.String()),
  target: t.Optional(t.Union([t.Literal('queue'), t.Literal('priority')])),
});

// ---------------------------------------------------------------------------
// Song request bodies + responses
// ---------------------------------------------------------------------------

export const BulkDeleteSchema = t.Object({
  ids: IdsArray,
});

export const BulkTagSchema = t.Object({
  ids: IdsArray,
  tags: t.Optional(StringArray),
  mode: t.Optional(t.Union([t.Literal('add'), t.Literal('set')])),
});

const SongFieldPatch = t.Partial(
  t.Object({
    nickname: t.Nullable(t.String()),
    artist: t.Nullable(t.String()),
    album: t.Nullable(t.String()),
    artwork: t.Nullable(t.String()),
    tags: t.Array(t.String()),
    volumeBoost: t.Nullable(t.Integer({ minimum: -100, maximum: 200 })),
  })
);

export const SongPatchSchema = SongFieldPatch;

export const BulkEditSchema = t.Intersect([
  SongFieldPatch,
  t.Object({
    ids: IdsArray,
    clearFields: t.Optional(StringArray),
  }),
]);

export const BulkRemoveSongsResponse = t.Object({
  removed: t.Number(),
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const PermissionsPatchSchema = t.Object({
  action: t.String(),
  roleIds: t.Array(t.String()),
});

export const PermissionsResponse = t.Object({
  mapping: t.Record(t.String(), StringArray),
  roles: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      color: t.Number(),
    })
  ),
  categories: t.Array(
    t.Object({
      label: t.String(),
      actions: StringArray,
    })
  ),
  labels: t.Record(t.String(), t.String()),
});

export const MyPermissionsResponse = t.Object({
  permissions: StringArray,
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

export const CreateRequestSchema = t.Object({
  sourceUrl: t.String(),
  notifyDm: t.Optional(t.Boolean()),
  nickname: t.Optional(t.Nullable(t.String())),
  artist: t.Optional(t.Nullable(t.String())),
  album: t.Optional(t.Nullable(t.String())),
  artwork: t.Optional(t.Nullable(t.String())),
  tags: t.Optional(t.Array(t.String())),
  volumeBoost: t.Optional(t.Nullable(t.Integer({ minimum: -100, maximum: 200 }))),
  type: t.Optional(t.Union([t.Literal('track'), t.Literal('playlist')])),
});

export const PatchRequestSchema = t.Object({
  status: t.Union([t.Literal('approved'), t.Literal('denied')]),
});

export const RequestPatchResponse = t.Object({
  request: SongRequest,
  song: t.Optional(Song),
  songs: t.Optional(t.Array(Song)),
  importedCount: t.Optional(t.Number()),
  skippedCount: t.Optional(t.Number()),
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

// ---------------------------------------------------------------------------
// Requests query (GET /api/requests)
// ---------------------------------------------------------------------------

export const RequestsQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  status: t.Optional(t.String()),
  mine: t.Optional(t.String()),
});

// ---------------------------------------------------------------------------
// Songs query (GET /api/songs and GET /api/playlists/:id)
// ---------------------------------------------------------------------------

export const SongsQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  sort: t.Optional(t.String()),
  order: t.Optional(t.String()),
  tags: t.Optional(t.String()),
  source: t.Optional(t.String()),
});

// ---------------------------------------------------------------------------
// Playlists query (GET /api/playlists)
// ---------------------------------------------------------------------------

export const PlaylistsQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  adminView: t.Optional(t.String()),
});
