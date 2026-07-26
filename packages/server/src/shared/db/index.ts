import { Database } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import * as schema from './schema';

// ---------------------------------------------------------------------------
// Drizzle client singleton
//
// Shared between the API and bot packages. Both run in the same Bun
// process, so this does not open a second physical socket.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL ?? 'data/alfira.db';

// Ensure the parent directory exists (e.g., data/ for local dev).
mkdirSync(dirname(DATABASE_URL), { recursive: true });

const sqliteDb = new Database(DATABASE_URL, { create: true, strict: true });
sqliteDb.run('PRAGMA journal_mode=WAL;');
sqliteDb.run('PRAGMA foreign_keys=ON;');
export const db = drizzle(sqliteDb, { schema });

export type * from './schema';
export { eq, sql, sqliteDb as $client };

// ---------------------------------------------------------------------------
// Tables shorthand — for direct consumer use in route files.
// ---------------------------------------------------------------------------
export const tables = {
  song: schema.song,
  playlist: schema.playlist,
  playlistSong: schema.playlistSong,
  refreshToken: schema.refreshToken,
  tag: schema.tag,
  guildSettings: schema.guildSettings,
  rolePermission: schema.rolePermission,
  songRequest: schema.songRequest,
};

// ---------------------------------------------------------------------------
// Relations — helpers for multi-table queries.
// ---------------------------------------------------------------------------

/** Fetch a single playlist with its songs ordered by position. */
export async function findPlaylistWithSongs(playlistId: string) {
  const result = await db
    .select()
    .from(schema.playlist)
    .leftJoin(schema.playlistSong, eq(schema.playlistSong.playlistId, schema.playlist.id))
    .leftJoin(schema.song, eq(schema.song.id, schema.playlistSong.songId))
    .where(eq(schema.playlist.id, playlistId));

  if (result.length === 0) {
    return null;
  }

  const songs = result
    .filter((r) => r.PlaylistSong !== null && r.Song !== null)
    .sort((a, b) => (a.PlaylistSong?.position ?? 0) - (b.PlaylistSong?.position ?? 0))
    .map(
      (r) =>
        ({
          ...r.PlaylistSong,
          song: r.Song,
        }) as {
          id: string;
          playlistId: string;
          songId: string;
          position: number;
          song: typeof schema.song.$inferSelect;
        }
    );

  return { ...(result[0] as (typeof result)[number]).Playlist, songs };
}
