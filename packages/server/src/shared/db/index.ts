import { Database } from 'bun:sqlite';
import { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

// ---------------------------------------------------------------------------
// Drizzle client singleton
//
// Shared between the API and bot packages. Both run in the same Bun
// process, so this does not open a second physical socket.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const sqliteDb = new Database(DATABASE_URL, { create: true });
sqliteDb.exec('PRAGMA journal_mode=WAL;');
sqliteDb.exec('PRAGMA foreign_keys=ON;');
export const db = drizzle(sqliteDb, { schema });

export type * from './schema';
export * as schema from './schema';
/** Re-export the underlying sqlite client for shutdown/health checks. */
// Re-export drizzle-orm operators so consumers don't need drizzle-orm as a direct dependency.
export { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, or, sql, sqliteDb as $client };

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

  if (result.length === 0) return null;

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

  return { ...result[0]?.Playlist, songs };
}
