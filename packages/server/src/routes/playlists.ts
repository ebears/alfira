import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { getUserDisplayName } from '../lib/displayName';
import { requireAuth } from '../lib/guards';
import { json } from '../lib/json';
import { canAccessPlaylist } from '../lib/playlistAccess';
import { emitPlaylistUpdated } from '../lib/socket';
import { validatePlaylistName } from '../lib/validation';
import { buildSongSearchClause } from '../lib/search';
import { db, tables } from '../shared/db';

const { playlist: playlistTable, playlistSong: playlistSongTable } = tables;

async function getPlaylistSongCount(playlistId: string): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(playlistSongTable)
    .where(eq(playlistSongTable.playlistId, playlistId));
  return result[0]?.value ?? 0;
}

type PlaylistRow = {
  id: string;
  name: string;
  createdBy: string;
  isPrivate: boolean;
  createdAt: Date;
  _count?: { songs: number };
};

async function findPlaylistOr404(id: string, withCount = false): Promise<PlaylistRow | null> {
  const [row] = await db
    .select({
      id: playlistTable.id,
      name: playlistTable.name,
      createdBy: playlistTable.createdBy,
      isPrivate: playlistTable.isPrivate,
      createdAt: playlistTable.createdAt,
    })
    .from(playlistTable)
    .where(eq(playlistTable.id, id))
    .limit(1);
  if (!row) return null;
  if (withCount) {
    const value = await getPlaylistSongCount(id);
    return { ...row, _count: { songs: value } };
  }
  return row;
}

function formatPlaylist(pl: typeof playlistTable.$inferSelect, songCount?: number) {
  return {
    ...pl,
    createdAt: pl.createdAt.toISOString(),
    ...(songCount !== undefined && { _count: { songs: songCount } }),
  };
}

function formatPlaylistSongWithSong(
  ps: typeof playlistSongTable.$inferSelect,
  song: typeof tables.song.$inferSelect,
  addedByDisplayName?: string
) {
  return {
    ...ps,
    song: {
      ...song,
      createdAt: song.createdAt.toISOString(),
      tags: song.tags ?? [],
      addedByDisplayName,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/playlists — paginated list of playlists
// ---------------------------------------------------------------------------
async function handleGetPlaylists(ctx: RouteContext, request: Request): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  const url = new URL(request.url);
  const adminView = url.searchParams.get('adminView') === 'true';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '30', 10) || 30)
  );
  const skip = (page - 1) * limit;

  const [playlists, totalResult] = await Promise.all([
    db.select().from(playlistTable).orderBy(playlistTable.createdAt).limit(limit).offset(skip),
    db.select({ count: count() }).from(playlistTable),
  ]);
  const totalCount = totalResult[0]?.count ?? 0;

  // Fetch song counts for each playlist
  const playlistsWithCounts = await Promise.all(
    playlists.map(async (pl) => {
      const value = await getPlaylistSongCount(pl.id);
      return formatPlaylist(pl, value);
    })
  );

  // Filter private playlists: only visible to creator and admins (in Admin View)
  const filteredPlaylists = playlistsWithCounts.filter(
    (pl) => canAccessPlaylist(pl, user, adminView).ok
  );

  // Fetch creator display names for each playlist
  const playlistsWithCreator = await Promise.all(
    filteredPlaylists.map(async (pl) => ({
      ...pl,
      createdByDisplayName: await getUserDisplayName(pl.createdBy),
    }))
  );

  return json({
    items: playlistsWithCreator,
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/playlists — create a new empty playlist
// ---------------------------------------------------------------------------
async function handlePostPlaylist(ctx: RouteContext, request: Request): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  let body: { name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const nameResult = validatePlaylistName(body.name);
  if (!nameResult.ok) return nameResult.response;
  const trimmedName = nameResult.value;

  const [playlist] = await db
    .insert(playlistTable)
    .values({
      name: trimmedName,
      createdBy: user.discordId,
    })
    .returning();

  if (!playlist) {
    return json({ error: 'Failed to create playlist.' }, 500);
  }

  emitPlaylistUpdated(formatPlaylist(playlist, 0));
  return json(playlist, 201);
}

// ---------------------------------------------------------------------------
// GET /api/playlists/:id — single playlist with paginated songs
// ---------------------------------------------------------------------------
async function handleGetPlaylist(
  ctx: RouteContext,
  request: Request,
  id: string
): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  const url = new URL(request.url);
  const adminView = url.searchParams.get('adminView') === 'true';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '30', 10) || 30)
  );
  const skip = (page - 1) * limit;
  const search = url.searchParams.get('search')?.trim() ?? '';

  const playlist = await findPlaylistOr404(id, true);
  if (!playlist) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(playlist, user, adminView);
  if (!accessResult.ok) {
    return json({ error: accessResult.error }, 403);
  }

  // Build list of song IDs to filter by when searching
  let songIds: string[] = [];
  if (search) {
    const matching = await db
      .select({ id: tables.song.id })
      .from(tables.song)
      .where(buildSongSearchClause(search))
      .limit(500);
    songIds = matching.map((s) => s.id);
    if (songIds.length === 0) {
      return json({
        ...playlist,
        createdAt: playlist.createdAt instanceof Date ? playlist.createdAt.toISOString() : playlist.createdAt,
        songs: [],
        createdByDisplayName: await getUserDisplayName(playlist.createdBy),
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }
  }

  // Fetch paginated songs
  const whereCondition =
    songIds.length > 0
      ? and(eq(playlistSongTable.playlistId, id), inArray(playlistSongTable.songId, songIds))
      : eq(playlistSongTable.playlistId, id);

  const countCondition =
    songIds.length > 0
      ? and(eq(playlistSongTable.playlistId, id), inArray(playlistSongTable.songId, songIds))
      : eq(playlistSongTable.playlistId, id);

  const [playlistSongs, totalResult] = await Promise.all([
    db
      .select()
      .from(playlistSongTable)
      .where(whereCondition)
      .orderBy(playlistSongTable.position)
      .limit(limit)
      .offset(skip),
    db.select({ count: count() }).from(playlistSongTable).where(countCondition),
  ]);
  const total = totalResult[0]?.count ?? 0;

  // Fetch the actual song data for each playlist entry
  const playlistSongIds = playlistSongs.map((ps) => ps.songId);
  const songs =
    playlistSongIds.length > 0
      ? await db.select().from(tables.song).where(inArray(tables.song.id, playlistSongIds))
      : [];
  const songMap = new Map(songs.map((s) => [s.id, s]));

  // Resolve Discord display names for unique addedBy IDs
  const uniqueIds = [...new Set(songs.map((s) => s.addedBy))];
  const nameMap = new Map<string, string>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      nameMap.set(id, await getUserDisplayName(id));
    })
  );

  return json({
    ...playlist,
    createdAt:
      playlist.createdAt instanceof Date ? playlist.createdAt.toISOString() : playlist.createdAt,
    songs: playlistSongs
      .map((ps) => {
        const song = songMap.get(ps.songId);
        if (!song) return null;
        return formatPlaylistSongWithSong(ps, song, nameMap.get(song.addedBy) ?? song.addedBy);
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    createdByDisplayName: await getUserDisplayName(playlist.createdBy),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/playlists/:id/visibility — toggle playlist visibility
// ---------------------------------------------------------------------------
async function handlePatchVisibility(
  ctx: RouteContext,
  request: Request,
  id: string
): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  let body: { isPrivate?: unknown; adminView?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (typeof body.isPrivate !== 'boolean') {
    return json({ error: 'isPrivate (boolean) is required.' }, 400);
  }

  const existing = await findPlaylistOr404(id);
  if (!existing) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const adminView = body.adminView === true;
  const accessResult = canAccessPlaylist(existing, user, adminView);
  if (!accessResult.ok) {
    return json({ error: accessResult.error }, 403);
  }

  const [updatedPlaylist] = await db
    .update(playlistTable)
    .set({ isPrivate: body.isPrivate })
    .where(eq(playlistTable.id, id))
    .returning();

  if (!updatedPlaylist) {
    return json({ error: 'Failed to update playlist.' }, 500);
  }

  const value = await getPlaylistSongCount(updatedPlaylist.id);

  emitPlaylistUpdated(formatPlaylist(updatedPlaylist, value));
  return json(updatedPlaylist);
}

// ---------------------------------------------------------------------------
// PATCH /api/playlists/:id — rename a playlist
// ---------------------------------------------------------------------------
async function handlePatchPlaylist(
  ctx: RouteContext,
  request: Request,
  id: string
): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  let body: { name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const nameResult = validatePlaylistName(body.name);
  if (!nameResult.ok) return nameResult.response;
  const trimmedName = nameResult.value;

  const existing = await findPlaylistOr404(id);
  if (!existing) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(existing, user, undefined);
  if (!accessResult.ok) {
    return json({ error: `Only the playlist owner or admins can rename this playlist.` }, 403);
  }

  const [updatedPlaylist] = await db
    .update(playlistTable)
    .set({ name: trimmedName })
    .where(eq(playlistTable.id, id))
    .returning();

  if (!updatedPlaylist) {
    return json({ error: 'Failed to update playlist.' }, 500);
  }

  const value = await getPlaylistSongCount(updatedPlaylist.id);

  emitPlaylistUpdated(formatPlaylist(updatedPlaylist, value));
  return json(updatedPlaylist);
}

// ---------------------------------------------------------------------------
// DELETE /api/playlists/:id — delete a playlist
// ---------------------------------------------------------------------------
async function handleDeletePlaylist(
  ctx: RouteContext,
  _request: Request,
  id: string
): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  const existing = await findPlaylistOr404(id);
  if (!existing) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(existing, user, undefined);
  if (!accessResult.ok) {
    return json({ error: `Only the playlist owner or admins can delete this playlist.` }, 403);
  }

  await db.delete(playlistTable).where(eq(playlistTable.id, id));

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// POST /api/playlists/:id/songs — add a song to a playlist
// ---------------------------------------------------------------------------
async function handleAddSong(ctx: RouteContext, request: Request, id: string): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  let body: { songId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!body.songId) {
    return json({ error: 'songId is required.' }, 400);
  }

  const playlist = await findPlaylistOr404(id);
  if (!playlist) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(playlist, user, undefined);
  if (!accessResult.ok) {
    return json(
      { error: `Only the playlist owner or admins can add songs to this playlist.` },
      403
    );
  }

  const [song] = await db
    .select()
    .from(tables.song)
    .where(eq(tables.song.id, body.songId as string))
    .limit(1);
  if (!song) {
    return json({ error: 'Song not found.' }, 404);
  }

  // Check for duplicate.
  const [existing] = await db
    .select()
    .from(playlistSongTable)
    .where(
      and(eq(playlistSongTable.playlistId, playlist.id), eq(playlistSongTable.songId, song.id))
    )
    .limit(1);

  if (existing) {
    return json({ error: 'This song is already in the playlist.' }, 409);
  }

  // Find the current highest position so we can append.
  const [lastEntry] = await db
    .select()
    .from(playlistSongTable)
    .where(eq(playlistSongTable.playlistId, playlist.id))
    .orderBy(desc(playlistSongTable.position))
    .limit(1);

  const nextPosition = (lastEntry?.position ?? -1) + 1;

  const [ps] = await db
    .insert(playlistSongTable)
    .values({
      playlistId: playlist.id,
      songId: song.id,
      position: nextPosition,
    })
    .returning();

  const songData = { ...song, createdAt: song.createdAt.toISOString(), tags: song.tags ?? [] };
  const value = await getPlaylistSongCount(playlist.id);

  emitPlaylistUpdated(formatPlaylist(playlist, value));

  return json(
    {
      ...ps,
      song: songData,
    },
    201
  );
}

// ---------------------------------------------------------------------------
// DELETE /api/playlists/:id/songs/:songId — remove a song from a playlist
// ---------------------------------------------------------------------------
async function handleRemoveSong(
  ctx: RouteContext,
  _request: Request,
  playlistId: string,
  songId: string
): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const user = userOrErr;

  const playlist = await findPlaylistOr404(playlistId);
  if (!playlist) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(playlist, user, undefined);
  if (!accessResult.ok) {
    return json({ error: `Only the playlist owner or admins can remove songs.` }, 403);
  }

  const [entry] = await db
    .select()
    .from(playlistSongTable)
    .where(and(eq(playlistSongTable.playlistId, playlistId), eq(playlistSongTable.songId, songId)))
    .limit(1);

  if (!entry) {
    return json({ error: 'Song not found in playlist.' }, 404);
  }

  // Delete and re-index in a transaction to prevent inconsistent positions.
  await db.transaction(async (tx) => {
    await tx
      .delete(playlistSongTable)
      .where(
        and(eq(playlistSongTable.playlistId, playlistId), eq(playlistSongTable.songId, songId))
      );

    // Re-index remaining songs to close the gap in positions.
    const remaining = await tx
      .select()
      .from(playlistSongTable)
      .where(eq(playlistSongTable.playlistId, playlistId))
      .orderBy(playlistSongTable.position);

    await Promise.all(
      remaining.map((ps, index) =>
        tx.update(playlistSongTable).set({ position: index }).where(eq(playlistSongTable.id, ps.id))
      )
    );
  });

  const value = await getPlaylistSongCount(playlistId);

  const updatedPlaylist = formatPlaylist(playlist, value);
  emitPlaylistUpdated(updatedPlaylist);

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handlePlaylists(ctx: RouteContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Strip /api/playlists prefix
  const path = pathname.slice('/api/playlists'.length);
  if (!path) {
    if (request.method === 'GET') return await handleGetPlaylists(ctx, request);
    if (request.method === 'POST') return await handlePostPlaylist(ctx, request);
    return json({ error: 'Not Found' }, 404);
  }

  // /api/playlists/:id/songs/:songId DELETE
  const songsMatch = path.match(/^\/([^/]+)\/songs\/([^/]+)$/);
  if (songsMatch && request.method === 'DELETE') {
    const [, playlistId, songId] = songsMatch;
    if (playlistId && songId) {
      return await handleRemoveSong(ctx, request, playlistId, songId);
    }
  }

  // /api/playlists/:id/songs POST
  const addSongMatch = path.match(/^\/([^/]+)\/songs$/);
  if (addSongMatch && request.method === 'POST') {
    const [, playlistId] = addSongMatch;
    if (playlistId) {
      return await handleAddSong(ctx, request, playlistId);
    }
  }

  // /api/playlists/:id/visibility PATCH
  const visibilityMatch = path.match(/^\/([^/]+)\/visibility$/);
  if (visibilityMatch && request.method === 'PATCH') {
    const [, playlistId] = visibilityMatch;
    if (playlistId) {
      return await handlePatchVisibility(ctx, request, playlistId);
    }
  }

  // /api/playlists/:id GET, PATCH, DELETE
  const idMatch = path.match(/^\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (id) {
      if (request.method === 'GET') return await handleGetPlaylist(ctx, request, id);
      if (request.method === 'PATCH') return await handlePatchPlaylist(ctx, request, id);
      if (request.method === 'DELETE') return await handleDeletePlaylist(ctx, request, id);
    }
  }

  return json({ error: 'Not Found' }, 404);
}
