import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const song = sqliteTable('Song', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  sourceUrl: text('sourceUrl').notNull().unique(),
  sourceId: text('sourceId').notNull().unique(),
  duration: integer('duration').notNull(),
  thumbnailUrl: text('thumbnailUrl').notNull(),
  addedBy: text('addedBy').notNull(),
  nickname: text('nickname'),
  artist: text('artist'),
  album: text('album'),
  artwork: text('artwork'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  volumeBoost: integer('volumeBoost'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const playlist = sqliteTable('Playlist', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  createdBy: text('createdBy').notNull(),
  isPrivate: integer('isPrivate', { mode: 'boolean' }).default(false).notNull(),
  tagNameLower: text('tagNameLower'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const playlistSong = sqliteTable(
  'PlaylistSong',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    playlistId: text('playlistId').notNull(),
    songId: text('songId').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    unique().on(t.playlistId, t.songId),
    index('PlaylistSong_playlistId_position_idx').on(t.playlistId, t.position),
  ]
);

export const refreshToken = sqliteTable(
  'RefreshToken',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tokenHash: text('tokenHash').notNull().unique(),
    discordId: text('discordId').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('RefreshToken_discordId_idx').on(t.discordId)]
);

export const tag = sqliteTable('Tag', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nameLower: text('nameLower').notNull().unique(),
  canonicalName: text('canonicalName').notNull(),
  color: text('color'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const guildSettings = sqliteTable('guildSettings', {
  id: integer('id').primaryKey(), // always 1 — single guild row
  compressorEnabled: integer('compressorEnabled', { mode: 'boolean' }).notNull().default(false),
  compressorThreshold: integer('compressorThreshold').notNull().default(-6), // dB, -60 to 0
  compressorRatio: real('compressorRatio').notNull().default(4.0), // 1.0 to 20.0
  compressorAttack: integer('compressorAttack').notNull().default(5), // ms, 0 to 100
  compressorRelease: integer('compressorRelease').notNull().default(50), // ms, 10 to 1000
  compressorGain: integer('compressorGain').notNull().default(3), // dB, 0 to 24
  eqEnabled: integer('eqEnabled', { mode: 'boolean' }).notNull().default(true),
  eqBand0: integer('eqBand0').notNull().default(50),
  eqBand1: integer('eqBand1').notNull().default(50),
  eqBand2: integer('eqBand2').notNull().default(50),
  eqBand3: integer('eqBand3').notNull().default(50),
  eqBand4: integer('eqBand4').notNull().default(50),
  eqBand5: integer('eqBand5').notNull().default(50),
  eqBand6: integer('eqBand6').notNull().default(50),
  eqBand7: integer('eqBand7').notNull().default(50),
  eqBand8: integer('eqBand8').notNull().default(50),
  eqBand9: integer('eqBand9').notNull().default(50),
  eqBand10: integer('eqBand10').notNull().default(50),
  eqBand11: integer('eqBand11').notNull().default(50),
  eqBand12: integer('eqBand12').notNull().default(50),
  eqBand13: integer('eqBand13').notNull().default(50),
  eqBand14: integer('eqBand14').notNull().default(50),

  // Karaoke filter
  karaokeEnabled: integer('karaokeEnabled', { mode: 'boolean' }).notNull().default(false),
  karaokeLevel: real('karaokeLevel').notNull().default(1.0),
  karaokeMonoLevel: real('karaokeMonoLevel').notNull().default(1.0),
  karaokeFilterBand: real('karaokeFilterBand').notNull().default(220.0),
  karaokeFilterWidth: real('karaokeFilterWidth').notNull().default(100.0),

  // Timescale filter
  timescaleEnabled: integer('timescaleEnabled', { mode: 'boolean' }).notNull().default(false),
  timescaleSpeed: real('timescaleSpeed').notNull().default(1.0),
  timescalePitch: real('timescalePitch').notNull().default(1.0),
  timescaleRate: real('timescaleRate').notNull().default(1.0),

  // Tremolo filter
  tremoloEnabled: integer('tremoloEnabled', { mode: 'boolean' }).notNull().default(false),
  tremoloFrequency: real('tremoloFrequency').notNull().default(2.0),
  tremoloDepth: real('tremoloDepth').notNull().default(0.5),

  // Vibrato filter
  vibratoEnabled: integer('vibratoEnabled', { mode: 'boolean' }).notNull().default(false),
  vibratoFrequency: real('vibratoFrequency').notNull().default(2.0),
  vibratoDepth: real('vibratoDepth').notNull().default(0.5),

  // Rotation filter
  rotationEnabled: integer('rotationEnabled', { mode: 'boolean' }).notNull().default(false),
  rotationHz: real('rotationHz').notNull().default(0.0),

  // Distortion filter
  distortionEnabled: integer('distortionEnabled', { mode: 'boolean' }).notNull().default(false),
  distortionSinOffset: real('distortionSinOffset').notNull().default(0.0),
  distortionSinScale: real('distortionSinScale').notNull().default(1.0),
  distortionCosOffset: real('distortionCosOffset').notNull().default(0.0),
  distortionCosScale: real('distortionCosScale').notNull().default(1.0),
  distortionTanOffset: real('distortionTanOffset').notNull().default(0.0),
  distortionTanScale: real('distortionTanScale').notNull().default(1.0),
  distortionOffset: real('distortionOffset').notNull().default(0.0),
  distortionScale: real('distortionScale').notNull().default(1.0),

  // Channel mix filter
  channelMixEnabled: integer('channelMixEnabled', { mode: 'boolean' }).notNull().default(false),
  channelMixLeftToLeft: real('channelMixLeftToLeft').notNull().default(1.0),
  channelMixLeftToRight: real('channelMixLeftToRight').notNull().default(0.0),
  channelMixRightToLeft: real('channelMixRightToLeft').notNull().default(0.0),
  channelMixRightToRight: real('channelMixRightToRight').notNull().default(1.0),

  // Low pass filter
  lowPassEnabled: integer('lowPassEnabled', { mode: 'boolean' }).notNull().default(false),
  lowPassSmoothing: real('lowPassSmoothing').notNull().default(20.0),

  // General setup / admin settings
  guildId: text('guildId'),
  setupCompleted: integer('setupCompleted', { mode: 'boolean' }).notNull().default(false),
  adminRoleIds: text('adminRoleIds').notNull().default(''),
  voiceIdleTimeoutMinutes: integer('voiceIdleTimeoutMinutes').notNull().default(5),
  afkNotificationChannelId: text('afkNotificationChannelId'),
  requestNotificationChannelId: text('requestNotificationChannelId'),
  notifyOnApproved: integer('notifyOnApproved', { mode: 'boolean' }).notNull().default(true),
  notifyOnDenied: integer('notifyOnDenied', { mode: 'boolean' }).notNull().default(true),
  publicUrl: text('publicUrl'),
  enabledSources: text('enabledSources').notNull().default('youtube,soundcloud'),
});

export const rolePermission = sqliteTable(
  'rolePermission',
  {
    action: text('action').notNull(),
    roleId: text('roleId').notNull(),
  },
  (t) => [primaryKey({ columns: [t.action, t.roleId] })]
);

export const songRequest = sqliteTable('SongRequest', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sourceUrl: text('sourceUrl').notNull(),
  sourceId: text('sourceId').notNull(),
  title: text('title').notNull(),
  duration: integer('duration').notNull(),
  thumbnailUrl: text('thumbnailUrl').notNull(),
  artist: text('artist'),
  artworkUrl: text('artworkUrl'),
  sourceName: text('sourceName'),
  requestedBy: text('requestedBy').notNull(),
  notifyDm: integer('notifyDm', { mode: 'boolean' }).notNull().default(false),
  type: text('type').notNull().default('track'), // 'track' | 'playlist'
  playlistData: text('playlistData', { mode: 'json' }).$type<{
    name: string;
    videoCount: number;
    thumbnailUrl?: string | null;
    videos?: {
      id: string;
      title: string;
      duration: number;
      thumbnailUrl?: string | null;
      artist?: string | null;
      artworkUrl?: string | null;
    }[];
  }>(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'denied'
  reviewedBy: text('reviewedBy'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  closedAt: integer('closedAt', { mode: 'timestamp_ms' }),
});
