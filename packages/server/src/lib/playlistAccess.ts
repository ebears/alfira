interface UserContext {
  discordId?: string;
  isAdmin?: boolean;
}

interface PlaylistLike {
  createdBy: string;
  isPrivate: boolean;
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
  if (!playlist.isPrivate) return { ok: true };
  const allowed =
    playlist.createdBy === user?.discordId || (user?.isAdmin === true && adminView === true);
  if (!allowed) {
    return { ok: false, error: 'Access denied. This playlist is private.' };
  }
  return { ok: true };
}
