import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { json } from '../lib/json';
import { parsePagination } from '../lib/pagination';
import { canAccessPlaylist, getPlaylistSongCount, requirePlaylist } from '../lib/playlistAccess';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import {
  buildSongFilterClause,
  buildSongOrderBy,
  buildSongSearchClause,
  parseSongSortField,
} from '../lib/search';
import { emitPlaylistUpdated } from '../lib/socket';
import { syncPlaylistToTag } from '../lib/syncPlaylistToTag';
import { validatePlaylistName } from '../lib/validation';
import { db, tables } from '../shared/db';

const { playlist: playlistTable, playlistSong: playlistSongTable } = tables;

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
// Request body schemas
// ---------------------------------------------------------------------------
const PlaylistCreateSchema = v.object({
  name: v.optional(v.string()),
  tagNameLower: v.optional(v.string()),
});

const PlaylistVisibilitySchema = v.object({
  isPrivate: v.optional(v.boolean()),
  adminView: v.optional(v.boolean()),
});

const PlaylistAddSongSchema = v.object({
  songId: v.string(),
});

const PlaylistRemoveSongsSchema = v.object({
  songIds: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5000)),
});

const PlaylistReorderSchema = v.object({
  songIds: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5000)),
});

// ---------------------------------------------------------------------------
// GET /api/playlists — paginated list of playlists
// ---------------------------------------------------------------------------
async function handleGetPlaylists(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  const url = new URL(request.url);
  const adminView = url.searchParams.get('adminView') === 'true';
  const { page, limit, skip } = parsePagination(url);

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

  // Batch-fetch cover artwork URLs (up to 4 per playlist)
  const playlistIds = filteredPlaylists.map((pl) => pl.id);
  const coverMap = new Map<string, string[]>();
  if (playlistIds.length > 0) {
    const songRows = await db
      .select({
        playlistId: playlistSongTable.playlistId,
        artwork: tables.song.artwork,
        thumbnailUrl: tables.song.thumbnailUrl,
      })
      .from(playlistSongTable)
      .innerJoin(tables.song, eq(playlistSongTable.songId, tables.song.id))
      .where(inArray(playlistSongTable.playlistId, playlistIds))
      .orderBy(playlistSongTable.playlistId, playlistSongTable.position);

    for (const row of songRows) {
      const urls = coverMap.get(row.playlistId);
      if (!urls) {
        coverMap.set(row.playlistId, [row.artwork ?? row.thumbnailUrl]);
      } else if (urls.length < 4) {
        urls.push(row.artwork ?? row.thumbnailUrl);
      }
    }
  }

  // Fetch creator display names for each playlist
  const playlistsWithCreator = await Promise.all(
    filteredPlaylists.map(async (pl) => ({
      ...pl,
      createdByDisplayName: await getUserDisplayName(pl.createdBy),
      coverUrls: coverMap.get(pl.id),
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
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(PlaylistCreateSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const body = parsed.output;

  const nameResult = validatePlaylistName(body.name);
  if (!nameResult.ok) {
    return nameResult.response;
  }
  const trimmedName = nameResult.value;

  const tagNameLower =
    typeof body.tagNameLower === 'string' && body.tagNameLower.trim().length > 0
      ? body.tagNameLower.trim().toLowerCase()
      : null;

  const [playlist] = await db
    .insert(playlistTable)
    .values({
      name: trimmedName,
      createdBy: user.discordId,
      tagNameLower,
    })
    .returning();

  if (!playlist) {
    return json({ error: 'Failed to create playlist.' }, 500);
  }

  // If smart playlist, populate with matching songs
  if (tagNameLower) {
    await syncPlaylistToTag(playlist.id);
  }

  const songCount = await getPlaylistSongCount(playlist.id);
  emitPlaylistUpdated(formatPlaylist(playlist, songCount));
  return json(playlist, 201);
}

// ---------------------------------------------------------------------------
// GET /api/playlists/:id — single playlist with paginated songs
// ---------------------------------------------------------------------------
async function handleGetPlaylist(
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
): Promise<Response> {
  const id = params.id!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  const url = new URL(request.url);
  const adminView = url.searchParams.get('adminView') === 'true';
  const { page, limit, skip } = parsePagination(url);
  const search = url.searchParams.get('search')?.trim() ?? '';

  // Sort & filter
  const sortRaw = url.searchParams.get('sort') ?? 'position';
  const sortField = ['position', 'title', 'artist', 'album', 'duration', 'createdAt'].includes(
    sortRaw
  )
    ? sortRaw
    : 'position';
  const sortOrder = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

  const tagsParam = url.searchParams.get('tags')?.trim();
  const sourcesParam = url.searchParams.get('source')?.trim();
  const filterTags = tagsParam
    ? tagsParam
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const filterSources = sourcesParam
    ? sourcesParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const wantsCustomSort = sortField !== 'position';

  const playlist = await requirePlaylist(id, user, adminView, true);
  if (playlist instanceof Response) {
    return playlist;
  }

  // ── Custom sort path: join playlistSong ↔ song, sort + filter in one query ──
  if (wantsCustomSort || filterTags.length > 0 || filterSources.length > 0) {
    // Build song-level filter clauses
    const songFilterClauses: ReturnType<typeof sql>[] = [];

    if (search) {
      const searchClause = buildSongSearchClause(search);
      if (searchClause) {
        songFilterClauses.push(searchClause);
      }
    }

    const tagSourceFilter = buildSongFilterClause(filterTags, filterSources, {
      tags: tables.song.tags,
      sourceUrl: tables.song.sourceUrl,
    });
    if (tagSourceFilter) {
      songFilterClauses.push(tagSourceFilter);
    }

    const joinWhere = and(
      eq(playlistSongTable.playlistId, id),
      ...(songFilterClauses.length > 0 ? [sql.join(songFilterClauses, sql` AND `)] : [])
    );

    const songSortField = wantsCustomSort ? parseSongSortField(sortField) : null;
    const orderBy = songSortField
      ? buildSongOrderBy(songSortField, sortOrder, {
          title: tables.song.title,
          nickname: tables.song.nickname,
          artist: tables.song.artist,
          album: tables.song.album,
          duration: tables.song.duration,
          createdAt: tables.song.createdAt,
        })
      : playlistSongTable.position;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(playlistSongTable)
        .innerJoin(tables.song, eq(playlistSongTable.songId, tables.song.id))
        .where(joinWhere)
        .orderBy(orderBy)
        .limit(limit)
        .offset(skip),
      db
        .select({ count: count() })
        .from(playlistSongTable)
        .innerJoin(tables.song, eq(playlistSongTable.songId, tables.song.id))
        .where(joinWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const songs = rows.map((r) => r.Song);
    const nameMap = await resolveDisplayNames(songs);

    return json({
      ...playlist,
      createdAt:
        playlist.createdAt instanceof Date ? playlist.createdAt.toISOString() : playlist.createdAt,
      songs: rows.map((r) =>
        formatPlaylistSongWithSong(
          r.PlaylistSong,
          r.Song,
          nameMap.get(r.Song.addedBy) ?? r.Song.addedBy
        )
      ),
      createdByDisplayName: await getUserDisplayName(playlist.createdBy),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  // ── Default path: position sort, search-only filter ──
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
        createdAt:
          playlist.createdAt instanceof Date
            ? playlist.createdAt.toISOString()
            : playlist.createdAt,
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
  const nameMap = await resolveDisplayNames(songs);

  return json({
    ...playlist,
    createdAt:
      playlist.createdAt instanceof Date ? playlist.createdAt.toISOString() : playlist.createdAt,
    songs: playlistSongs
      .map((ps) => {
        const song = songMap.get(ps.songId);
        if (!song) {
          return null;
        }
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
  params: Record<string, string>
): Promise<Response> {
  const id = params.id!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(PlaylistVisibilitySchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { isPrivate, adminView: rawAdminView } = parsed.output;

  if (isPrivate === undefined) {
    return json({ error: 'isPrivate (boolean) is required.' }, 400);
  }

  const adminView = rawAdminView === true;
  const existing = await requirePlaylist(id, user, adminView);
  if (existing instanceof Response) {
    return existing;
  }

  const [updatedPlaylist] = await db
    .update(playlistTable)
    .set({ isPrivate })
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
  params: Record<string, string>
): Promise<Response> {
  const id = params.id!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(PlaylistCreateSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const body = parsed.output;

  const existing = await requirePlaylist(id, user);
  if (existing instanceof Response) {
    return existing;
  }

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const nameResult = validatePlaylistName(body.name);
    if (!nameResult.ok) {
      return nameResult.response;
    }
    data.name = nameResult.value;
  }

  if (body.tagNameLower !== undefined) {
    if (body.tagNameLower === null || body.tagNameLower === '') {
      data.tagNameLower = null;
    } else if (typeof body.tagNameLower === 'string' && body.tagNameLower.trim().length > 0) {
      data.tagNameLower = body.tagNameLower.trim().toLowerCase();
    }
  }

  if (Object.keys(data).length === 0) {
    return json({ error: 'No valid fields to update.' }, 400);
  }

  const [updatedPlaylist] = await db
    .update(playlistTable)
    .set(data)
    .where(eq(playlistTable.id, id))
    .returning();

  if (!updatedPlaylist) {
    return json({ error: 'Failed to update playlist.' }, 500);
  }

  // If tag was set or changed, sync songs to tag
  if ('tagNameLower' in data) {
    await syncPlaylistToTag(updatedPlaylist.id);
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
  params: Record<string, string>
): Promise<Response> {
  const id = params.id!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  const existing = await requirePlaylist(id, user);
  if (existing instanceof Response) {
    return existing;
  }

  await db.delete(playlistTable).where(eq(playlistTable.id, id));

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// POST /api/playlists/:id/songs — add a song to a playlist
// ---------------------------------------------------------------------------
async function handleAddSong(
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
): Promise<Response> {
  const id = params.id!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(PlaylistAddSongSchema, raw);
  if (!parsed.success) {
    return json({ error: 'songId is required.' }, 400);
  }

  const { songId } = parsed.output;

  const playlist = await requirePlaylist(id, user);
  if (playlist instanceof Response) {
    return playlist;
  }

  // Smart playlists are auto-managed — reject manual adds
  if (playlist.tagNameLower) {
    return json(
      {
        error: `This playlist automatically tracks the "${playlist.tagNameLower}" tag. Songs are added when tagged and cannot be added manually.`,
      },
      409
    );
  }

  const [song] = await db.select().from(tables.song).where(eq(tables.song.id, songId)).limit(1);
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
  params: Record<string, string>
): Promise<Response> {
  const playlistId = params.id!;
  const songId = params.songId!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  const playlist = await requirePlaylist(playlistId, user);
  if (playlist instanceof Response) {
    return playlist;
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
// POST /api/playlists/:id/songs/bulk-remove — remove multiple songs from a playlist
// ---------------------------------------------------------------------------
async function handleBulkRemoveSongs(
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
): Promise<Response> {
  const playlistId = params.id!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  const playlist = await requirePlaylist(playlistId, user);
  if (playlist instanceof Response) {
    return playlist;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(PlaylistRemoveSongsSchema, raw);
  if (!parsed.success) {
    return json({ error: 'songIds must be a non-empty array.' }, 400);
  }

  const { songIds } = parsed.output;

  // Delete and re-index in a transaction
  await db.transaction(async (tx) => {
    await tx
      .delete(playlistSongTable)
      .where(
        and(
          eq(playlistSongTable.playlistId, playlistId),
          inArray(playlistSongTable.songId, songIds)
        )
      );

    // Re-index remaining songs to close gaps in positions
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
  emitPlaylistUpdated(formatPlaylist(playlist, value));

  return json({ removed: songIds.length });
}

// ---------------------------------------------------------------------------
// PATCH /api/playlists/:id/reorder — reorder songs in a playlist
// ---------------------------------------------------------------------------
async function handleReorderSongs(
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
): Promise<Response> {
  const playlistId = params.id!;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const { user } = guards;

  const playlist = await requirePlaylist(playlistId, user);
  if (playlist instanceof Response) {
    return playlist;
  }

  // Smart playlists are auto-managed — reject manual reorder
  if (playlist.tagNameLower) {
    return json({ error: 'Cannot reorder a smart playlist. It is managed by its tag.' }, 409);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(PlaylistReorderSchema, raw);
  if (!parsed.success) {
    return json({ error: 'songIds must be a non-empty array.' }, 400);
  }

  const { songIds } = parsed.output;

  // Verify all songIds belong to this playlist and the count matches
  const existing = await db
    .select({ songId: playlistSongTable.songId })
    .from(playlistSongTable)
    .where(eq(playlistSongTable.playlistId, playlistId));

  const existingIds = new Set(existing.map((e) => e.songId));

  if (songIds.length !== existingIds.size) {
    return json(
      {
        error: `songIds count (${songIds.length}) does not match playlist song count (${existingIds.size}).`,
      },
      400
    );
  }

  for (const id of songIds) {
    if (!existingIds.has(id)) {
      return json({ error: `Song ${id} is not in this playlist.` }, 400);
    }
  }

  // Delete all and re-insert with new positions in a transaction
  await db.transaction(async (tx) => {
    await tx.delete(playlistSongTable).where(eq(playlistSongTable.playlistId, playlistId));

    const rows = songIds.map((songId, index) => ({
      playlistId,
      songId,
      position: index,
    }));

    await tx.insert(playlistSongTable).values(rows);
  });

  const value = await getPlaylistSongCount(playlistId);
  emitPlaylistUpdated(formatPlaylist(playlist, value));

  return json({ message: 'Playlist reordered.' });
}

// ---------------------------------------------------------------------------
export const handlePlaylists = routeTable('/api/playlists', {
  rateLimit: { windowMs: 60_000, maxRequests: 20, bucket: 'playlists-mutations' },
  routes: [
    ['GET', '/', handleGetPlaylists],
    ['POST', '/', handlePostPlaylist],
    ['POST', '/:id/songs/bulk-remove', handleBulkRemoveSongs],
    ['DELETE', '/:id/songs/:songId', handleRemoveSong],
    ['POST', '/:id/songs', handleAddSong],
    ['PATCH', '/:id/visibility', handlePatchVisibility],
    ['GET', '/:id', handleGetPlaylist],
    ['PATCH', '/:id', handlePatchPlaylist],
    ['PATCH', '/:id/reorder', handleReorderSongs],
    ['DELETE', '/:id', handleDeletePlaylist],
  ],
});
