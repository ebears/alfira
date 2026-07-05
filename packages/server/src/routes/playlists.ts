import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { json } from '../lib/json';
import { parsePagination } from '../lib/pagination';
import { canAccessPlaylist } from '../lib/playlistAccess';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../lib/rateLimit';
import { checkGuards } from '../lib/routeGuards';
import { buildSongSearchClause, SOURCE_LIKE_PATTERNS } from '../lib/search';
import { emitPlaylistUpdated } from '../lib/socket';
import { syncPlaylistToTag } from '../lib/syncPlaylistToTag';
import { validatePlaylistName } from '../lib/validation';
import { db, tables } from '../shared/db';

const { playlist: playlistTable, playlistSong: playlistSongTable } = tables;

function buildSongOrderBy(field: string, direction: 'ASC' | 'DESC'): ReturnType<typeof sql> {
  switch (field) {
    case 'title':
      return sql`lower(${tables.song.title}) ${sql.raw(direction)}`;
    case 'artist':
      return sql`${tables.song.artist} IS NULL, lower(${tables.song.artist}) ${sql.raw(direction)}`;
    case 'album':
      return sql`${tables.song.album} IS NULL, lower(${tables.song.album}) ${sql.raw(direction)}`;
    case 'duration':
      return sql`${tables.song.duration} ${sql.raw(direction)}`;
    case 'createdAt':
      return sql`${tables.song.createdAt} ${sql.raw(direction)}`;
    default:
      return sql`${tables.song.createdAt} ${sql.raw(direction)}`;
  }
}

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
  tagNameLower: string | null;
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
      tagNameLower: playlistTable.tagNameLower,
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
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
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
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: { name?: unknown; tagNameLower?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const nameResult = validatePlaylistName(body.name);
  if (!nameResult.ok) return nameResult.response;
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
  id: string
): Promise<Response> {
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
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

  const playlist = await findPlaylistOr404(id, true);
  if (!playlist) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(playlist, user, adminView);
  if (!accessResult.ok) {
    return json({ error: accessResult.error }, 403);
  }

  // ── Custom sort path: join playlistSong ↔ song, sort + filter in one query ──
  if (wantsCustomSort || filterTags.length > 0 || filterSources.length > 0) {
    // Build song-level filter clauses
    const songFilterClauses: ReturnType<typeof sql>[] = [];

    if (search) {
      const searchClause = buildSongSearchClause(search);
      if (searchClause) songFilterClauses.push(searchClause);
    }

    for (const tag of filterTags) {
      songFilterClauses.push(sql`lower(${tables.song.tags}) LIKE lower(${`%"${tag}"%`})`);
    }

    if (filterSources.length > 0) {
      const sourceOrs: ReturnType<typeof sql>[] = [];
      for (const source of filterSources) {
        const patterns = SOURCE_LIKE_PATTERNS[source];
        if (patterns) {
          for (const pattern of patterns) {
            sourceOrs.push(sql`${tables.song.sourceUrl} LIKE ${pattern}`);
          }
        }
      }
      if (sourceOrs.length > 0) {
        songFilterClauses.push(sql`(${sql.join(sourceOrs, sql` OR `)})`);
      }
    }

    const joinWhere = and(
      eq(playlistSongTable.playlistId, id),
      ...(songFilterClauses.length > 0 ? [sql.join(songFilterClauses, sql` AND `)] : [])
    );

    const orderBy = wantsCustomSort
      ? buildSongOrderBy(sortField, sortOrder)
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
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

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
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: { name?: unknown; tagNameLower?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const existing = await findPlaylistOr404(id);
  if (!existing) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(existing, user, undefined);
  if (!accessResult.ok) {
    return json({ error: `Only the playlist owner or admins can rename this playlist.` }, 403);
  }

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const nameResult = validatePlaylistName(body.name);
    if (!nameResult.ok) return nameResult.response;
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
  id: string
): Promise<Response> {
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

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
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

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

  // Smart playlists are auto-managed — reject manual adds
  if (playlist.tagNameLower) {
    return json(
      {
        error:
          'This playlist automatically tracks the "' +
          playlist.tagNameLower +
          '" tag. Songs are added when tagged and cannot be added manually.',
      },
      409
    );
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
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

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
// POST /api/playlists/:id/songs/bulk-remove — remove multiple songs from a playlist
// ---------------------------------------------------------------------------
async function handleBulkRemoveSongs(
  ctx: RouteContext,
  request: Request,
  playlistId: string
): Promise<Response> {
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

  const playlist = await findPlaylistOr404(playlistId);
  if (!playlist) {
    return json({ error: 'Playlist not found.' }, 404);
  }

  const accessResult = canAccessPlaylist(playlist, user, undefined);
  if (!accessResult.ok) {
    return json({ error: `Only the playlist owner or admins can remove songs.` }, 403);
  }

  let body: { songIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!Array.isArray(body.songIds) || body.songIds.length === 0) {
    return json({ error: 'songIds must be a non-empty array.' }, 400);
  }

  const songIds = (body.songIds as string[]).slice(0, 5000);

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
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Match a path against a template with `:param` placeholders.
 * Returns named parameters on match, null otherwise.
 * Does NOT handle method matching — callers check `request.method`.
 *
 * Example: matchPath('/abc/xyz/songs/123', '/:id/songs/:songId') => { id: 'abc/xyz', songId: '123' }
 */
function matchPath(path: string, template: string): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean);
  const tplParts = template.split('/').filter(Boolean);
  if (pathParts.length !== tplParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < tplParts.length; i++) {
    const tpl = tplParts[i];
    const seg = pathParts[i];
    if (!tpl || !seg) return null;
    if (tpl.startsWith(':')) {
      params[tpl.slice(1)] = seg;
    } else if (tpl !== seg) {
      return null;
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handlePlaylists(ctx: RouteContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Rate-limit mutation endpoints — 20 requests per 60s per IP.
  if (request.method !== 'GET') {
    const ip = getClientIp(request);
    if (!checkRateLimit('playlists-mutations', ip, { windowMs: 60_000, maxRequests: 20 })) {
      return rateLimitResponse(60);
    }
  }

  // Strip /api/playlists prefix
  const path = pathname.slice('/api/playlists'.length) || '/';

  // GET /api/playlists
  if (request.method === 'GET' && path === '/') return await handleGetPlaylists(ctx, request);

  // POST /api/playlists
  if (request.method === 'POST' && path === '/') return await handlePostPlaylist(ctx, request);

  // POST /api/playlists/:id/songs/bulk-remove
  let params = matchPath(path, '/:id/songs/bulk-remove');
  if (params && request.method === 'POST') {
    return await handleBulkRemoveSongs(ctx, request, params.id);
  }

  // DELETE /api/playlists/:id/songs/:songId
  params = matchPath(path, '/:id/songs/:songId');
  if (params && request.method === 'DELETE') {
    return await handleRemoveSong(ctx, request, params.id, params.songId);
  }

  // POST /api/playlists/:id/songs
  params = matchPath(path, '/:id/songs');
  if (params && request.method === 'POST') return await handleAddSong(ctx, request, params.id);

  // PATCH /api/playlists/:id/visibility
  params = matchPath(path, '/:id/visibility');
  if (params && request.method === 'PATCH')
    return await handlePatchVisibility(ctx, request, params.id);

  // GET / PATCH / DELETE /api/playlists/:id
  params = matchPath(path, '/:id');
  if (params) {
    const { id } = params;
    if (request.method === 'GET') return await handleGetPlaylist(ctx, request, id);
    if (request.method === 'PATCH') return await handlePatchPlaylist(ctx, request, id);
    if (request.method === 'DELETE') return await handleDeletePlaylist(ctx, request, id);
  }

  return json({ error: 'Not Found' }, 404);
}
