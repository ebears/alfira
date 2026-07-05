import { eq, sql } from 'drizzle-orm';
import { db, tables } from '../shared/db';

const { playlistSong: playlistSongTable, playlist: playlistTable, song: songTable } = tables;

/**
 * Replaces all songs in a smart playlist with the current set of songs
 * matching the playlist's tracked tag. Runs in a transaction.
 *
 * Returns the playlist with updated song count for socket emission.
 */
export async function syncPlaylistToTag(
  playlistId: string
): Promise<typeof playlistTable.$inferSelect | null> {
  const [playlist] = await db
    .select()
    .from(playlistTable)
    .where(eq(playlistTable.id, playlistId))
    .limit(1);

  if (!playlist?.tagNameLower) return null;

  await db.transaction(async (tx) => {
    // Remove all existing playlist-song entries
    await tx.delete(playlistSongTable).where(eq(playlistSongTable.playlistId, playlistId));

    // Find all songs matching the tag and insert them
    const songs = await tx
      .select()
      .from(songTable)
      .where(sql`lower(${songTable.tags}) LIKE lower(${`%${playlist.tagNameLower}%`})`)
      .orderBy(songTable.title);

    if (songs.length === 0) return;

    await tx.insert(playlistSongTable).values(
      songs.map((song, index) => ({
        playlistId,
        songId: song.id,
        position: index,
      }))
    );
  });

  return playlist;
}
