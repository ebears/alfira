import { count, eq } from 'drizzle-orm';

import { db, tables } from '../shared/db';
import { ApiError } from './errors';

const { playlist: playlistTable, playlistSong: playlistSongTable } = tables;

interface UserContext {
  discordId?: string;
  isAdmin?: boolean;
}

interface PlaylistLike {
  createdBy: string;
  isPrivate: boolean;
}

interface PlaylistRow {
  id: string;
  name: string;
  createdBy: string;
  isPrivate: boolean;
  tagNameLower: string | null;
  createdAt: Date;
  _count?: { songs: number };
}

/**
 * Checks if user can view/modify a playlist.
 * - Public playlists: always accessible
 * - Private playlists: accessible to creator or admins (when adminView is true)
 * Returns true if access is allowed, error message if denied.
 */
export function canAccessPlaylist(
  playlist: PlaylistLike,
  user: UserContext | undefined,
  adminView?: boolean
): { ok: true } | { ok: false; error: string } {
  if (!playlist.isPrivate) {
    return { ok: true };
  }
  const allowed =
    playlist.createdBy === user?.discordId || (user?.isAdmin === true && adminView === true);
  if (!allowed) {
    return { ok: false, error: 'Access denied. This playlist is private.' };
  }
  return { ok: true };
}

export async function getPlaylistSongCount(playlistId: string): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(playlistSongTable)
    .where(eq(playlistSongTable.playlistId, playlistId));
  return result[0]?.value ?? 0;
}

async function findPlaylistOr404(id: string, withCount = false): Promise<PlaylistRow | null> {
  const [row] = await db
    .select({
      id: playlistTable.id,
      name: playlistTable.name,
      createdBy: playlistTable.createdBy,
      isPrivate: playlistTable.isPrivate,
      tagNameLower: playlistTable.tagNameLower,
      createdAt: playlistTable.createdAt,
    })
    .from(playlistTable)
    .where(eq(playlistTable.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  if (withCount) {
    const value = await getPlaylistSongCount(id);
    return { ...row, _count: { songs: value } };
  }
  return row;
}

/**
 * Look up a playlist by ID and verify the user has access to it.
 * Combines findPlaylistOr404 (404 guard) and canAccessPlaylist (403 guard)
 * into a single call.
 *
 * Returns the PlaylistRow if found and accessible, throws ApiError otherwise.
 */
export async function requirePlaylist(
  id: string,
  user: UserContext,
  adminView?: boolean,
  withCount?: boolean
): Promise<PlaylistRow> {
  const playlist = await findPlaylistOr404(id, withCount);
  if (!playlist) {
    throw new ApiError(404, 'Playlist not found.');
  }
  const accessResult = canAccessPlaylist(playlist, user, adminView);
  if (!accessResult.ok) {
    throw new ApiError(403, accessResult.error);
  }
  return playlist;
}
