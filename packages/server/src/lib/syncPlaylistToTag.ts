import { and, eq, inArray, sql } from 'drizzle-orm';

import { db, tables } from '../shared/db';
import { emitPlaylistUpdated } from './socket';

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

  if (!playlist?.tagNameLower) {
    return null;
  }

  await db.transaction(async (tx) => {
    // Remove all existing playlist-song entries
    await tx.delete(playlistSongTable).where(eq(playlistSongTable.playlistId, playlistId));

    // Find all songs matching the tag and insert them
    const songs = await tx
      .select()
      .from(songTable)
      .where(sql`lower(${songTable.tags}) LIKE lower(${`%${playlist.tagNameLower}%`})`)
      .orderBy(songTable.title);

    if (songs.length === 0) {
      return;
    }

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

/**
 * Re-sync all smart playlists that track any of the given tag names.
 * Called after song tag mutations (bulk tag, bulk edit, single patch).
 */
export async function reSyncPlaylistsForTags(tagNamesLower: string[]): Promise<void> {
  if (tagNamesLower.length === 0) {
    return;
  }

  const affectedPlaylists = await db
    .select({ id: playlistTable.id, tagNameLower: playlistTable.tagNameLower })
    .from(playlistTable)
    .where(
      and(
        sql`${playlistTable.tagNameLower} IS NOT NULL`,
        inArray(playlistTable.tagNameLower, tagNamesLower)
      )
    );

  for (const pl of affectedPlaylists) {
    if (!pl.tagNameLower) {
      continue;
    }
    await syncPlaylistToTag(pl.id);
    const [updatedPl] = await db
      .select()
      .from(playlistTable)
      .where(eq(playlistTable.id, pl.id))
      .limit(1);
    if (!updatedPl) {
      continue;
    }

    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(playlistSongTable)
      .where(eq(playlistSongTable.playlistId, pl.id));
    const { count } = row!;

    emitPlaylistUpdated({
      ...updatedPl,
      createdAt: updatedPl.createdAt.toISOString(),
      _count: { songs: count ?? 0 },
    });
  }
}
