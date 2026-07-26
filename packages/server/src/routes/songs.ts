import { eq, inArray, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { getGuildId } from '../lib/config';
import { type RouteContext } from '../lib/context';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { json } from '../lib/json';
import { parsePagination } from '../lib/pagination';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import {
  buildSongFilterClause,
  buildSongOrderBy,
  buildSongSearchClause,
  parseSongSortField,
} from '../lib/search';
import { formatSong } from '../lib/serialization';
import { emitSongDeleted, emitSongUpdated } from '../lib/socket';
import { validateAndBuildSongFields } from '../lib/songFieldValidation';
import { reSyncPlaylistsForTags } from '../lib/syncPlaylistToTag';
import { canonicalizeTags } from '../lib/tagCanonicalization';
import { validateTags } from '../lib/validation';
import { db, tables } from '../shared/db';
import { getPlayer } from '../startDiscord';

const { song: songTable } = tables;

const BulkDeleteSchema = v.object({
  ids: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5000)),
});

// ---------------------------------------------------------------------------
// Shared helper — update the live GuildPlayer cache after a song edit so
// the UI reflects metadata changes immediately (currentSong, priorityQueue,
// regular queue).  Also pushes a live volume boost change to NodeLink when
// the edited song is currently playing.
// ---------------------------------------------------------------------------
function notifyPlayerOfMetadataChange(
  songIds: string[],
  data: Record<string, unknown>,
  processedVolumeBoost: number | null | undefined
): void {
  const player = getPlayer(getGuildId());
  if (!player) {
    return;
  }

  if (processedVolumeBoost !== undefined) {
    const currentSong = player.getCurrentSong();
    if (currentSong && songIds.includes(currentSong.id)) {
      player.updateVolumeBoost(processedVolumeBoost ?? 0);
    }
  }

  const fields: Record<string, unknown> = {};
  if ('nickname' in data) {
    fields.nickname = data.nickname;
  }
  if ('artist' in data) {
    fields.artist = data.artist;
  }
  if ('album' in data) {
    fields.album = data.album;
  }
  if ('artwork' in data) {
    fields.artwork = data.artwork;
  }
  if ('tags' in data) {
    fields.tags = data.tags;
  }
  if ('volumeBoost' in data) {
    fields.volumeBoost = data.volumeBoost;
  }
  player.updateSongMetadata(songIds, fields);
}

// ---------------------------------------------------------------------------
// POST /api/songs/bulk-delete — delete multiple songs at once.
// ---------------------------------------------------------------------------
async function handleBulkDelete(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'songs.delete' });
  if (guards instanceof Response) {
    return guards;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(BulkDeleteSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { ids } = parsed.output;

  // Delete songs from DB
  await db.delete(songTable).where(inArray(songTable.id, ids));

  // Emit deleted events for each song so connected clients update in real time
  for (const id of ids) {
    emitSongDeleted(id);
  }

  return json({ deleted: ids.length });
}

const BulkTagSchema = v.object({
  ids: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5000)),
  tags: v.optional(v.array(v.string())),
  mode: v.optional(v.pipe(v.string(), v.picklist(['add', 'set']))),
});

// ---------------------------------------------------------------------------
// POST /api/songs/bulk-tag — add or set tags on multiple songs at once.
// ---------------------------------------------------------------------------
async function handleBulkTag(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'songs.edit' });
  if (guards instanceof Response) {
    return guards;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(BulkTagSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { ids } = parsed.output;

  const tagsResult = validateTags(parsed.output.tags);
  if (!tagsResult.ok) {
    return tagsResult.response;
  }

  const newTags = await canonicalizeTags(tagsResult.value);
  const mode = parsed.output.mode ?? 'add';

  // Fetch existing songs
  const existingSongs = await db.select().from(songTable).where(inArray(songTable.id, ids));

  const updatedIds: string[] = [];

  if (mode === 'set') {
    // Replace tags entirely
    await db.update(songTable).set({ tags: newTags }).where(inArray(songTable.id, ids));
    updatedIds.push(...ids);
  } else {
    // Merge: add new tags to each song's existing tags — run updates in parallel
    await Promise.all(
      existingSongs.map(async (song) => {
        const existingTags = song.tags ?? [];
        const merged = [...new Set([...existingTags, ...newTags])];
        await db.update(songTable).set({ tags: merged }).where(eq(songTable.id, song.id));
        updatedIds.push(song.id);
      })
    );
  }

  // Re-fetch updated songs and emit events
  const updatedSongs = await db.select().from(songTable).where(inArray(songTable.id, updatedIds));

  // Resolve display names before emitting so the frontend doesn't lose them
  const bulkTagNameMap = await resolveDisplayNames(updatedSongs);
  for (const s of updatedSongs) {
    emitSongUpdated({
      ...formatSong(s),
      addedByDisplayName: bulkTagNameMap.get(s.addedBy) ?? s.addedBy,
    });
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
  const guards = checkGuards(ctx, { admin: true, permission: 'songs.edit' });
  if (guards instanceof Response) {
    return guards;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const BulkEditBaseSchema = v.object({
    ids: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5000)),
    nickname: v.optional(v.string()),
    artist: v.optional(v.string()),
    album: v.optional(v.string()),
    artwork: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    volumeBoost: v.optional(v.number()),
    clearFields: v.optional(v.array(v.string())),
  });

  const parsed = v.safeParse(BulkEditBaseSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { ids, clearFields = [] } = parsed.output;
  const body = parsed.output;

  const fieldResult = await validateAndBuildSongFields(body, clearFields);
  if (fieldResult instanceof Response) {
    return fieldResult;
  }
  const { data, processedTags, processedVolumeBoost } = fieldResult;

  if (Object.keys(data).length === 0) {
    return json({ error: 'No fields to update.' }, 400);
  }

  await db.update(songTable).set(data).where(inArray(songTable.id, ids));

  // Re-fetch updated songs and emit events
  const updatedSongs = await db.select().from(songTable).where(inArray(songTable.id, ids));

  // Resolve display names before emitting so the frontend doesn't lose them
  const bulkEditNameMap = await resolveDisplayNames(updatedSongs);
  for (const s of updatedSongs) {
    emitSongUpdated({
      ...formatSong(s),
      addedByDisplayName: bulkEditNameMap.get(s.addedBy) ?? s.addedBy,
    });
  }

  // If tags changed, re-sync any smart playlists tracking affected tags
  if (processedTags) {
    await reSyncPlaylistsForTags(processedTags.map((t) => t.toLowerCase()));
  }

  // Update the player cache for any of the edited songs that are currently
  // in the queue / now playing.
  notifyPlayerOfMetadataChange(ids, data, processedVolumeBoost);

  return json({ updated: ids.length });
}

// ---------------------------------------------------------------------------
// GET /api/songs — paginated list of songs with sort & filter.
// ---------------------------------------------------------------------------
async function handleGetSongs(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }

  const url = new URL(request.url);
  const { page, limit, skip } = parsePagination(url);
  const search = url.searchParams.get('search')?.trim() ?? '';

  // Sort
  const sortRaw = url.searchParams.get('sort') ?? 'createdAt';
  const sortField = parseSongSortField(sortRaw) ?? 'createdAt';
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
  const filterClause = buildSongFilterClause(filterTags, filterSources);

  let where: ReturnType<typeof sql> | undefined;
  if (searchClause && filterClause) {
    where = sql`(${searchClause} AND ${filterClause})`;
  } else if (searchClause) {
    where = searchClause;
  } else if (filterClause) {
    where = filterClause;
  }

  const orderBy = buildSongOrderBy(sortField, sortOrder);

  const [songs, countResult] = await Promise.all([
    db.select().from(songTable).where(where).orderBy(orderBy).offset(skip).limit(limit),
    db
      .select({ count: sql<number>`count(*)` })
      .from(songTable)
      .where(where),
  ]);
  const total = Math.trunc(Number(String(countResult[0]?.count ?? 0)));

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
  params: Record<string, string>
): Promise<Response> {
  const id = params.id as string;
  const guards = checkGuards(ctx, { admin: true, permission: 'songs.delete' });
  if (guards instanceof Response) {
    return guards;
  }

  const [existing] = await db.select().from(songTable).where(eq(songTable.id, id)).limit(1);
  if (!existing) {
    return json({ error: 'Song not found.' }, 404);
  }

  await db.delete(songTable).where(eq(songTable.id, id));

  // Notify all connected clients so the Songs page removes the card in real time.
  emitSongDeleted(id);

  return new Response(null, { status: 204 });
}

const SongPatchSchema = v.partial(
  v.object({
    nickname: v.unknown(),
    artist: v.unknown(),
    album: v.unknown(),
    artwork: v.unknown(),
    tags: v.unknown(),
    volumeBoost: v.unknown(),
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/songs/:id — update song fields. Admin only.
// ---------------------------------------------------------------------------
async function handlePatchSong(
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
): Promise<Response> {
  const id = params.id as string;
  const guards = checkGuards(ctx, { admin: true, permission: 'songs.edit' });
  if (guards instanceof Response) {
    return guards;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(SongPatchSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const body = parsed.output;

  const [existing] = await db.select().from(songTable).where(eq(songTable.id, id)).limit(1);
  if (!existing) {
    return json({ error: 'Song not found.' }, 404);
  }

  // Track old tags for smart playlist re-sync
  const oldTagsLower = new Set((existing.tags ?? []).map((t: string) => t.toLowerCase()));

  const fieldResult = await validateAndBuildSongFields(body);
  if (fieldResult instanceof Response) {
    return fieldResult;
  }
  const { data, processedTags, processedVolumeBoost } = fieldResult;

  const [updatedSong] = await db
    .update(songTable)
    .set(data)
    .where(eq(songTable.id, id))
    .returning();

  if (!updatedSong) {
    return json({ error: 'Failed to update song.' }, 500);
  }

  const patchedDisplayName = await getUserDisplayName(updatedSong.addedBy);
  emitSongUpdated({
    ...formatSong(updatedSong),
    addedByDisplayName: patchedDisplayName,
  });

  // If tags changed, re-sync any smart playlists tracking affected tags
  if (processedTags) {
    const newTagsLower = new Set(processedTags.map((t) => t.toLowerCase()));
    const affectedTags = [...new Set([...oldTagsLower, ...newTagsLower])];
    await reSyncPlaylistsForTags(affectedTags);
  }

  // Update the song in the GuildPlayer's cache (currentSong, priorityQueue,
  // regular queue) so the UI reflects metadata changes immediately.
  notifyPlayerOfMetadataChange([id], data, processedVolumeBoost);

  return json(formatSong(updatedSong));
}

export const handleSongs = routeTable('/api/songs', {
  rateLimit: { windowMs: 60_000, maxRequests: 20, bucket: 'songs-mutations' },
  routes: [
    ['GET', '/', handleGetSongs],
    ['POST', '/bulk-delete', handleBulkDelete],
    ['POST', '/bulk-tag', handleBulkTag],
    ['POST', '/bulk-edit', handleBulkEdit],
    ['DELETE', '/:id', handleDeleteSong],
    ['PATCH', '/:id', handlePatchSong],
  ],
});
