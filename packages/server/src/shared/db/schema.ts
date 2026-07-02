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

  // General setup / admin settings
  guildId: text('guildId'),
  setupCompleted: integer('setupCompleted', { mode: 'boolean' }).notNull().default(false),
  adminRoleIds: text('adminRoleIds').notNull().default(''),
  voiceIdleTimeoutMinutes: integer('voiceIdleTimeoutMinutes').notNull().default(5),
  notificationChannelId: text('notificationChannelId'),
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
