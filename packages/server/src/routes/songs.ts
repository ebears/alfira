import { eq, inArray, sql } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { getGuildId } from '../lib/config';
import { resolveDisplayNames } from '../lib/displayName';
import { json } from '../lib/json';
import { parsePagination } from '../lib/pagination';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../lib/rateLimit';
import { checkGuards } from '../lib/routeGuards';
import { buildSongSearchClause, SOURCE_LIKE_PATTERNS } from '../lib/search';
import { formatSong } from '../lib/serialization';
import { emitSongDeleted, emitSongUpdated } from '../lib/socket';
import { reSyncPlaylistsForTags } from '../lib/syncPlaylistToTag';
import { canonicalizeTags } from '../lib/tagCanonicalization';
import {
  validateArtworkUrl,
  validateNickname,
  validateOptionalString,
  validateTags,
  validateVolumeBoost,
} from '../lib/validation';
import { db, tables } from '../shared/db';
import { getPlayer } from '../startDiscord';

const { song: songTable } = tables;

const ALLOWED_SORTS = ['createdAt', 'title', 'artist', 'album', 'duration'] as const;
type SortField = (typeof ALLOWED_SORTS)[number];

// ---------------------------------------------------------------------------
// Build a dynamic ORDER BY clause from sort field + direction.
// ---------------------------------------------------------------------------
function buildOrderByClause(
  sortField: SortField,
  sortOrder: 'ASC' | 'DESC'
): ReturnType<typeof sql> {
  switch (sortField) {
    case 'title':
      return sql`lower(title) ${sql.raw(sortOrder)}`;
    case 'artist':
      return sql`artist IS NULL, lower(artist) ${sql.raw(sortOrder)}`;
    case 'album':
      return sql`album IS NULL, lower(album) ${sql.raw(sortOrder)}`;
    case 'duration':
      return sql`duration ${sql.raw(sortOrder)}`;
    default:
      return sql`"createdAt" ${sql.raw(sortOrder)}`;
  }
}

// ---------------------------------------------------------------------------
// Build additional filter clauses for tags (AND) and sources (OR).
// Returns a SQL fragment that can be AND-ed with the search clause, or
// undefined when no filters are active.
// ---------------------------------------------------------------------------
function buildFilterClause(tags: string[], sources: string[]): ReturnType<typeof sql> | undefined {
  const clauses: ReturnType<typeof sql>[] = [];

  // Tags: AND — song must have every requested tag
  for (const tag of tags) {
    // Match JSON-quoted tag name for precision (avoids partial matches like
    // "rock" matching "bedrock").
    clauses.push(sql`lower(tags) LIKE lower(${`%"${tag}"%`})`);
  }

  // Sources: OR — song URL can match any of the requested sources
  if (sources.length > 0) {
    const sourceOrs: ReturnType<typeof sql>[] = [];
    for (const source of sources) {
      const patterns = SOURCE_LIKE_PATTERNS[source];
      if (patterns) {
        for (const pattern of patterns) {
          sourceOrs.push(sql`"sourceUrl" LIKE ${pattern}`);
        }
      }
    }
    if (sourceOrs.length > 0) {
      clauses.push(sql`(${sql.join(sourceOrs, sql` OR `)})`);
    }
  }

  if (clauses.length === 0) return undefined;
  return sql.join(clauses, sql` AND `);
}

// ---------------------------------------------------------------------------
// POST /api/songs/bulk-delete — delete multiple songs at once.
// ---------------------------------------------------------------------------
async function handleBulkDelete(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'songs.delete' });
  if (guards instanceof Response) return guards;

  let body: { ids?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return json({ error: 'ids must be a non-empty array of song IDs.' }, 400);
  }

  const ids = body.ids.slice(0, 5000) as string[];

  // Delete songs from DB
  await db.delete(songTable).where(inArray(songTable.id, ids));

  // Emit deleted events for each song so connected clients update in real time
  for (const id of ids) {
    emitSongDeleted(id);
  }

  return json({ deleted: ids.length });
}

// ---------------------------------------------------------------------------
// POST /api/songs/bulk-tag — add or set tags on multiple songs at once.
// ---------------------------------------------------------------------------
async function handleBulkTag(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'songs.edit' });
  if (guards instanceof Response) return guards;

  let body: { ids?: unknown; tags?: unknown; mode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return json({ error: 'ids must be a non-empty array of song IDs.' }, 400);
  }

  const tagsResult = validateTags(body.tags);
  if (!tagsResult.ok) return tagsResult.response;

  const ids = (body.ids as string[]).slice(0, 5000);
  const newTags = await canonicalizeTags(tagsResult.value);
  const mode = body.mode === 'set' ? 'set' : 'add'; // "add" is default (merge with existing)

  // Fetch existing songs
  const existingSongs = await db.select().from(songTable).where(inArray(songTable.id, ids));

  const updatedIds: string[] = [];

  if (mode === 'set') {
    // Replace tags entirely
    await db.update(songTable).set({ tags: newTags }).where(inArray(songTable.id, ids));
    updatedIds.push(...ids);
  } else {
    // Merge: add new tags to each song's existing tags
    for (const song of existingSongs) {
      const existingTags = song.tags ?? [];
      const merged = [...new Set([...existingTags, ...newTags])];
      await db.update(songTable).set({ tags: merged }).where(eq(songTable.id, song.id));
      updatedIds.push(song.id);
    }
  }

  // Re-fetch updated songs and emit events
  const updatedSongs = await db.select().from(songTable).where(inArray(songTable.id, updatedIds));

  for (const s of updatedSongs) {
    emitSongUpdated(formatSong(s));
  }

  // If tags changed, re-sync any smart playlists tracking affected tags
  if (newTags.length > 0) {
    await reSyncPlaylistsForTags(newTags.map((t) => t.toLowerCase()));
  }

  return json({ updated: updatedSongs.length, tags: newTags });
}

// ---------------------------------------------------------------------------
// POST /api/songs/bulk-edit — set metadata fields on multiple songs at once.
// Fields left undefined are skipped. Fields listed in clearFields are set to null.
// ---------------------------------------------------------------------------
async function handleBulkEdit(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'songs.edit' });
  if (guards instanceof Response) return guards;

  let body: {
    ids?: unknown;
    nickname?: unknown;
    artist?: unknown;
    album?: unknown;
    artwork?: unknown;
    tags?: unknown;
    volumeBoost?: unknown;
    clearFields?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return json({ error: 'ids must be a non-empty array of song IDs.' }, 400);
  }

  const ids = (body.ids as string[]).slice(0, 5000);
  const clearFields: string[] = Array.isArray(body.clearFields)
    ? (body.clearFields as string[])
    : [];

  const data: Record<string, unknown> = {};

  // Nickname
  if ('nickname' in body && body.nickname !== undefined) {
    const result = validateNickname(body.nickname);
    if (!result.ok) return result.response;
    data.nickname = result.value;
  } else if (clearFields.includes('nickname')) {
    data.nickname = null;
  }

  // Artist
  if ('artist' in body && body.artist !== undefined) {
    data.artist = validateOptionalString(body.artist);
  } else if (clearFields.includes('artist')) {
    data.artist = null;
  }

  // Album
  if ('album' in body && body.album !== undefined) {
    data.album = validateOptionalString(body.album);
  } else if (clearFields.includes('album')) {
    data.album = null;
  }

  // Artwork
  if ('artwork' in body && body.artwork !== undefined) {
    const artworkResult = validateArtworkUrl(body.artwork);
    if (!artworkResult.ok) return artworkResult.response;
    data.artwork = artworkResult.value;
  } else if (clearFields.includes('artwork')) {
    data.artwork = null;
  }

  // Tags
  if ('tags' in body && body.tags !== undefined) {
    const tagsResult = validateTags(body.tags);
    if (!tagsResult.ok) return tagsResult.response;
    data.tags = await canonicalizeTags(tagsResult.value);
  } else if (clearFields.includes('tags')) {
    data.tags = [];
  }

  // Volume boost
  if ('volumeBoost' in body && body.volumeBoost !== undefined) {
    const volumeResult = validateVolumeBoost(body.volumeBoost);
    if (!volumeResult.ok) return volumeResult.response;
    data.volumeBoost = volumeResult.value;
  } else if (clearFields.includes('volumeBoost')) {
    data.volumeBoost = null;
  }

  if (Object.keys(data).length === 0) {
    return json({ error: 'No fields to update.' }, 400);
  }

  await db.update(songTable).set(data).where(inArray(songTable.id, ids));

  // Re-fetch updated songs and emit events
  const updatedSongs = await db.select().from(songTable).where(inArray(songTable.id, ids));

  for (const s of updatedSongs) {
    emitSongUpdated(formatSong(s));
  }

  // If tags changed, re-sync any smart playlists tracking affected tags
  if ('tags' in data) {
    await reSyncPlaylistsForTags(((data.tags as string[]) ?? []).map((t) => t.toLowerCase()));
  }

  // Update the player cache for any of the edited songs that are currently
  // in the queue / now playing.
  const bulkPlayer = getPlayer(getGuildId());
  if (bulkPlayer) {
    if ('volumeBoost' in data) {
      const currentSong = bulkPlayer.getCurrentSong();
      if (currentSong && ids.includes(currentSong.id)) {
        bulkPlayer.updateVolumeBoost(data.volumeBoost as number);
      }
    }
    const bulkFields: Record<string, unknown> = {};
    if ('nickname' in data) bulkFields.nickname = data.nickname;
    if ('artist' in data) bulkFields.artist = data.artist;
    if ('album' in data) bulkFields.album = data.album;
    if ('artwork' in data) bulkFields.artwork = data.artwork;
    if ('tags' in data) bulkFields.tags = data.tags;
    if ('volumeBoost' in data) bulkFields.volumeBoost = data.volumeBoost;
    bulkPlayer.updateSongMetadata(
      ids,
      bulkFields as Parameters<typeof bulkPlayer.updateSongMetadata>[1]
    );
  }

  return json({ updated: ids.length });
}

// ---------------------------------------------------------------------------
// GET /api/songs — paginated list of songs with sort & filter.
// ---------------------------------------------------------------------------
async function handleGetSongs(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;

  const url = new URL(request.url);
  const { page, limit, skip } = parsePagination(url);
  const search = url.searchParams.get('search')?.trim() ?? '';

  // Sort
  const sortRaw = url.searchParams.get('sort') ?? 'createdAt';
  const sortField: SortField = (ALLOWED_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortField)
    : 'createdAt';
  const sortOrder = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

  // Filters
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

  // Build WHERE clause — search text + tag/source filters
  const searchClause = buildSongSearchClause(search || undefined);
  const filterClause = buildFilterClause(filterTags, filterSources);

  let where: ReturnType<typeof sql> | undefined;
  if (searchClause && filterClause) {
    where = sql`(${searchClause} AND ${filterClause})`;
  } else if (searchClause) {
    where = searchClause;
  } else if (filterClause) {
    where = filterClause;
  }

  const orderBy = buildOrderByClause(sortField, sortOrder);

  const [songs, countResult] = await Promise.all([
    db.select().from(songTable).where(where).orderBy(orderBy).offset(skip).limit(limit),
    db.select({ count: sql<number>`count(*)` }).from(songTable).where(where),
  ]);
  const total = parseInt(String(countResult[0]?.count ?? 0), 10);

  // Resolve Discord display names for unique addedBy IDs
  const nameMap = await resolveDisplayNames(songs);

  const songsWithNames = songs.map((s) => ({
    ...formatSong(s),
    addedByDisplayName: nameMap.get(s.addedBy) ?? s.addedBy,
  }));

  return json({
    items: songsWithNames,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/songs/:id — delete a song. Admin only.
// ---------------------------------------------------------------------------
async function handleDeleteSong(
  ctx: RouteContext,
  _request: Request,
  id: string
): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'songs.delete' });
  if (guards instanceof Response) return guards;

  const [existing] = await db.select().from(songTable).where(eq(songTable.id, id)).limit(1);
  if (!existing) {
    return json({ error: 'Song not found.' }, 404);
  }

  await db.delete(songTable).where(eq(songTable.id, id));

  // Notify all connected clients so the Songs page removes the card in real time.
  emitSongDeleted(id);

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// PATCH /api/songs/:id — update song fields. Admin only.
// ---------------------------------------------------------------------------
async function handlePatchSong(ctx: RouteContext, request: Request, id: string): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'songs.edit' });
  if (guards instanceof Response) return guards;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const [existing] = await db.select().from(songTable).where(eq(songTable.id, id)).limit(1);
  if (!existing) {
    return json({ error: 'Song not found.' }, 404);
  }

  const data: Record<string, unknown> = {};

  // Nickname
  if ('nickname' in body) {
    const result = validateNickname(body.nickname);
    if (!result.ok) return result.response;
    data.nickname = result.value;
  }

  // Artist
  if ('artist' in body) {
    data.artist = validateOptionalString(body.artist);
  }

  // Album
  if ('album' in body) {
    data.album = validateOptionalString(body.album);
  }

  // Artwork
  if ('artwork' in body) {
    const artworkResult = validateArtworkUrl(body.artwork);
    if (!artworkResult.ok) return artworkResult.response;
    data.artwork = artworkResult.value;
  }

  // Tags
  // Track old tags for smart playlist re-sync
  const oldTagsLower = new Set((existing.tags ?? []).map((t: string) => t.toLowerCase()));

  if ('tags' in body) {
    const tagsResult = validateTags(body.tags);
    if (!tagsResult.ok) return tagsResult.response;
    data.tags = await canonicalizeTags(tagsResult.value);
  }

  // Volume boost
  if ('volumeBoost' in body) {
    const volumeResult = validateVolumeBoost(body.volumeBoost);
    if (!volumeResult.ok) return volumeResult.response;
    data.volumeBoost = volumeResult.value;
  }

  const [updatedSong] = await db
    .update(songTable)
    .set(data)
    .where(eq(songTable.id, id))
    .returning();

  if (!updatedSong) {
    return json({ error: 'Failed to update song.' }, 500);
  }

  emitSongUpdated(formatSong(updatedSong));

  // If tags changed, re-sync any smart playlists tracking affected tags
  if ('tags' in data) {
    const newTagsLower = new Set(
      ((data.tags as string[]) ?? []).map((t: string) => t.toLowerCase())
    );
    const affectedTags = [...new Set([...oldTagsLower, ...newTagsLower])];
    await reSyncPlaylistsForTags(affectedTags);
  }

  // Update the song in the GuildPlayer's cache (currentSong, priorityQueue,
  // regular queue) so the UI reflects metadata changes immediately.
  const player = getPlayer(getGuildId());
  if (player) {
    // Volume boost also needs live audio update
    if (data.volumeBoost !== undefined) {
      const currentSong = player.getCurrentSong();
      if (currentSong?.id === id) {
        player.updateVolumeBoost(data.volumeBoost as number);
      }
    }

    // Build fields object with only the keys that are actually in data —
    // undefined values still create keys, which would clear fields in merge.
    const fields: Record<string, unknown> = {};
    if ('nickname' in data) fields.nickname = data.nickname;
    if ('artist' in data) fields.artist = data.artist;
    if ('album' in data) fields.album = data.album;
    if ('artwork' in data) fields.artwork = data.artwork;
    if ('tags' in data) fields.tags = data.tags;
    if ('volumeBoost' in data) fields.volumeBoost = data.volumeBoost;
    player.updateSongMetadata(id, fields as Parameters<typeof player.updateSongMetadata>[1]);
  }

  return json(formatSong(updatedSong));
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handleSongs(ctx: RouteContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Rate-limit mutation endpoints — 20 requests per 60s per IP.
  // GET is exempt to allow the UI to fetch pages freely.
  if (request.method !== 'GET') {
    const ip = getClientIp(request);
    if (!checkRateLimit('songs-mutations', ip, { windowMs: 60_000, maxRequests: 20 })) {
      return rateLimitResponse(60);
    }
  }

  // GET /api/songs
  if (request.method === 'GET' && pathname === '/api/songs') {
    return await handleGetSongs(ctx, request);
  }

  // POST /api/songs/bulk-delete
  if (request.method === 'POST' && pathname === '/api/songs/bulk-delete') {
    return await handleBulkDelete(ctx, request);
  }

  // POST /api/songs/bulk-tag
  if (request.method === 'POST' && pathname === '/api/songs/bulk-tag') {
    return await handleBulkTag(ctx, request);
  }

  // POST /api/songs/bulk-edit
  if (request.method === 'POST' && pathname === '/api/songs/bulk-edit') {
    return await handleBulkEdit(ctx, request);
  }

  // DELETE /api/songs/:id
  if (request.method === 'DELETE' && pathname.startsWith('/api/songs/')) {
    const id = pathname.slice('/api/songs/'.length);
    return await handleDeleteSong(ctx, request, id);
  }

  // PATCH /api/songs/:id
  if (request.method === 'PATCH' && pathname.startsWith('/api/songs/')) {
    const id = pathname.slice('/api/songs/'.length);
    return await handlePatchSong(ctx, request, id);
  }

  return json({ error: 'Not Found' }, 404);
}
