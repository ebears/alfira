import { eq, inArray, or, sql } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { getGuildId } from '../lib/config';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { json } from '../lib/json';
import { parsePagination } from '../lib/pagination';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../lib/rateLimit';
import { checkGuards } from '../lib/routeGuards';
import { buildSongSearchClause } from '../lib/search';
import { formatSong } from '../lib/serialization';
import { emitSongAdded, emitSongDeleted, emitSongUpdated } from '../lib/socket';
import { canonicalizeTags } from '../lib/tagCanonicalization';
import {
  clampMaxVideos,
  fetchPlaylistMetadata,
  fetchSourceMetadata,
  validateArtworkUrl,
  validateNickname,
  validateOptionalString,
  validatePlaylistUrl,
  validateSourceUrl,
  validateTags,
  validateVolumeBoost,
  youTubeUrl,
} from '../lib/validation';
import { db, tables } from '../shared/db';
import { getPlayer } from '../startDiscord';

const { song: songTable } = tables;

// ---------------------------------------------------------------------------
// GET /api/songs — paginated list of songs, newest first.
// ---------------------------------------------------------------------------
async function handleGetSongs(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx);
  if (guards instanceof Response) return guards;

  const url = new URL(request.url);
  const { page, limit, skip } = parsePagination(url);
  const search = url.searchParams.get('search')?.trim() ?? '';

  const where = buildSongSearchClause(search || undefined);

  const [songs, countResult] = await Promise.all([
    db
      .select()
      .from(songTable)
      .where(where)
      .orderBy(sql`"createdAt" DESC`)
      .offset(skip)
      .limit(limit),
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
// POST /api/songs — add a song by source URL. Admin only.
// ---------------------------------------------------------------------------
async function handlePostSong(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'songs.add' });
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: { url?: unknown; nickname?: unknown; asPlaylist?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const asPlaylist = body.asPlaylist === true;
  const nicknameResult = validateNickname(body.nickname);
  if (!nicknameResult.ok) return nicknameResult.response;

  const urlResult = validateSourceUrl(body.url);
  if (!urlResult.ok) return urlResult.response;
  let url = urlResult.value;

  // If user wants to import as playlist, validate as playlist URL first.
  if (asPlaylist) {
    const playlistResult = validatePlaylistUrl(url);
    if (!playlistResult.ok) return playlistResult.response;
    url = playlistResult.value;
  } else {
    // Strip any ?list=... query param so a plain song URL always adds a single track.
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('list');
      url = parsed.toString();
    } catch {
      // leave URL unchanged
    }
  }

  const metadataResult = await fetchSourceMetadata(url);
  if (!metadataResult.ok) return metadataResult.response;
  const metadata = metadataResult.value;

  // Check for duplicate by sourceId.
  const [existing] = await db
    .select()
    .from(songTable)
    .where(eq(songTable.sourceId, metadata.sourceId))
    .limit(1);

  if (existing) {
    return json(
      {
        error: 'This song is already in your library.',
        song: formatSong(existing),
      },
      409
    );
  }

  const [song] = await db
    .insert(songTable)
    .values({
      title: metadata.title,
      sourceUrl: url,
      sourceId: metadata.sourceId,
      duration: metadata.duration,
      thumbnailUrl: metadata.thumbnailUrl ?? '',
      addedBy: user.discordId,
      nickname: nicknameResult.value,
    })
    .returning();

  if (!song) {
    return json({ error: 'Failed to create song.' }, 500);
  }

  const formatted = formatSong(song);
  const displayName = await getUserDisplayName(user.discordId);
  const enriched = { ...formatted, addedByDisplayName: displayName };
  emitSongAdded(enriched);

  return json(enriched, 201);
}

// ---------------------------------------------------------------------------
// POST /api/songs/import-playlist — import playlist. Admin only.
// ---------------------------------------------------------------------------
async function handleImportPlaylist(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'songs.import' });
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: { url?: unknown; maxVideos?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const maxVideos = clampMaxVideos(body.maxVideos);
  const urlResult = validatePlaylistUrl(body.url);
  if (!urlResult.ok) return urlResult.response;
  const url = urlResult.value;

  const playlistResult = await fetchPlaylistMetadata(url, maxVideos);
  if (!playlistResult.ok) return playlistResult.response;
  const playlistMetadata = playlistResult.value;

  // Build the canonical URL format for each video
  const videosWithUrls = playlistMetadata.videos.map((v) => ({
    ...v,
    canonicalUrl: youTubeUrl(v.id),
  }));

  let existingSongs: { sourceId: string; sourceUrl: string }[] = [];
  if (videosWithUrls.length > 0) {
    existingSongs = await db
      .select({ sourceId: songTable.sourceId, sourceUrl: songTable.sourceUrl })
      .from(songTable)
      .where(
        or(
          inArray(
            songTable.sourceId,
            videosWithUrls.map((v) => v.id)
          ),
          inArray(
            songTable.sourceUrl,
            videosWithUrls.map((v) => v.canonicalUrl)
          )
        )
      );
  }

  // Create sets for quick lookup
  const existingSourceIds = new Set(existingSongs.map((s) => s.sourceId));
  const existingSourceUrls = new Set(existingSongs.map((s) => s.sourceUrl));

  // Filter out duplicates (check both sourceId and sourceUrl)
  const newVideos = videosWithUrls.filter(
    (v) => !existingSourceIds.has(v.id) && !existingSourceUrls.has(v.canonicalUrl)
  );

  if (newVideos.length === 0) {
    return json({
      message: 'All songs from this playlist are already in your library.',
      playlistTitle: playlistMetadata.title,
      totalVideos: playlistMetadata.videoCount,
      importedCount: 0,
      skippedCount: playlistMetadata.videos.length,
    });
  }

  const addedByDiscordId = user.discordId;

  // Create songs in a transaction
  const createdSongs = await db.transaction((tx) => {
    return tx
      .insert(songTable)
      .values(
        newVideos.map((video) => ({
          title: video.title,
          sourceUrl: video.canonicalUrl,
          sourceId: video.id,
          duration: video.duration,
          thumbnailUrl: video.thumbnailUrl ?? '',
          addedBy: addedByDiscordId,
        }))
      )
      .returning();
  });

  // Emit socket events for each new song
  const nameMap = await resolveDisplayNames(createdSongs);
  for (const song of createdSongs) {
    const formatted = formatSong(song);
    emitSongAdded({
      ...formatted,
      addedByDisplayName: nameMap.get(song.addedBy) ?? song.addedBy,
    });
  }

  return json(
    {
      message: `Successfully imported ${createdSongs.length} song(s) from "${playlistMetadata.title}".`,
      playlistTitle: playlistMetadata.title,
      totalVideos: playlistMetadata.videoCount,
      importedCount: createdSongs.length,
      skippedCount: playlistMetadata.videos.length - newVideos.length,
      songs: createdSongs.map(formatSong),
    },
    201
  );
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

  // If this song is currently playing, update volume live without restarting
  const player = getPlayer(getGuildId());
  if (player && data.volumeBoost !== undefined) {
    const currentSong = player.getCurrentSong();
    if (currentSong?.id === id) {
      player.updateVolumeBoost(data.volumeBoost as number);
    }
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

  // POST /api/songs/import-playlist
  if (request.method === 'POST' && pathname === '/api/songs/import-playlist') {
    return await handleImportPlaylist(ctx, request);
  }

  // GET /api/songs
  if (request.method === 'GET' && pathname === '/api/songs') {
    return await handleGetSongs(ctx, request);
  }

  // POST /api/songs
  if (request.method === 'POST' && pathname === '/api/songs') {
    return await handlePostSong(ctx, request);
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
