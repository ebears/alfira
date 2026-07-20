import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { RouteContext } from '../lib/context';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { json } from '../lib/json';
import { sendRequestDm, sendRequestNotification } from '../lib/notifications';
import { parsePagination } from '../lib/pagination';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { formatSong } from '../lib/serialization';
import { emitSongAdded } from '../lib/socket';
import { canonicalizeTags } from '../lib/tagCanonicalization';
import {
  fetchPlaylistMetadata,
  fetchSourceMetadata,
  validateArtworkUrl,
  validateNickname,
  validateOptionalString,
  validateSourceUrl,
  validateTags,
  validateVolumeBoost,
  youTubeUrl,
} from '../lib/validation';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';
import type { SongRequest } from '../shared/types';
import { isPlaylistUrl } from '../startDiscord';

const { song: songTable, songRequest: requestTable } = tables;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRequest(row: typeof requestTable.$inferSelect): SongRequest {
  const base = {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
    playlistData: row.playlistData as SongRequest['playlistData'],
    type: row.type as 'track' | 'playlist',
  };
  return base as SongRequest;
}

async function userCanAutoApprove(ctx: RouteContext): Promise<boolean> {
  if (ctx.isAdmin) return true;
  if (!ctx.user) return false;
  const userRoles = ctx.user.roles ?? [];
  if (userRoles.length === 0) return false;

  const rows = await db
    .select({ roleId: tables.rolePermission.roleId })
    .from(tables.rolePermission)
    .where(
      and(
        eq(tables.rolePermission.action, 'requests.autoapprove'),
        inArray(tables.rolePermission.roleId, userRoles)
      )
    );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// POST /api/requests/preview — resolve URL metadata without creating.
// ---------------------------------------------------------------------------
async function handlePreviewRequest(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = checkGuards(ctx);
  if (guards instanceof Response) return guards;

  let body: { url?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const urlResult = validateSourceUrl(body.url);
  if (!urlResult.ok) return urlResult.response;
  let url = urlResult.value;

  // Strip any ?list=... query param for single-track preview
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('list');
    url = parsed.toString();
  } catch {
    // leave URL unchanged
  }

  const isPlaylist = isPlaylistUrl(url);

  if (isPlaylist) {
    const playlistResult = await fetchPlaylistMetadata(url, 100);
    if (!playlistResult.ok) return playlistResult.response;
    const pm = playlistResult.value;

    const playlistThumb = pm.videos[0]?.thumbnailUrl ?? '';
    return json({
      title: pm.title,
      sourceId: `playlist-${Date.now()}`, // placeholder; real sourceId on approval
      duration: pm.videos.reduce((sum, v) => sum + (v.duration || 0), 0),
      thumbnailUrl: playlistThumb,
      sourceName: 'playlist',
      artist: null,
      artworkUrl: null,
      alreadyExists: false,
      isPlaylist: true,
      playlistMeta: {
        name: pm.title,
        videoCount: pm.videoCount,
        thumbnailUrl: playlistThumb,
      },
    });
  }

  const metadataResult = await fetchSourceMetadata(url);
  if (!metadataResult.ok) return metadataResult.response;
  const metadata = metadataResult.value;

  const [existing] = await db
    .select()
    .from(songTable)
    .where(eq(songTable.sourceId, metadata.sourceId))
    .limit(1);

  // alreadyExists only counts pending requests — a song that was previously
  // approved but later deleted from the library should be re-requestable.
  const [existingReq] = await db
    .select()
    .from(requestTable)
    .where(and(eq(requestTable.sourceId, metadata.sourceId), eq(requestTable.status, 'pending')))
    .limit(1);

  return json({
    title: metadata.title,
    sourceId: metadata.sourceId,
    duration: metadata.duration,
    thumbnailUrl: metadata.thumbnailUrl ?? '',
    sourceName: metadata.sourceName ?? null,
    artist: metadata.artist ?? null,
    artworkUrl: metadata.artworkUrl ?? null,
    alreadyExists: !!existing || !!existingReq,
    isPlaylist: false,
    playlistMeta: undefined,
  });
}

// ---------------------------------------------------------------------------
// POST /api/requests — create a song or playlist request.
// ---------------------------------------------------------------------------
async function handleCreateRequest(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: {
    sourceUrl?: unknown;
    notifyDm?: unknown;
    nickname?: unknown;
    artist?: unknown;
    album?: unknown;
    artwork?: unknown;
    tags?: unknown;
    volumeBoost?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const notifyDm = body.notifyDm === true;

  const nicknameResult = validateNickname(body.nickname);
  if (!nicknameResult.ok) return nicknameResult.response;

  const artist = validateOptionalString(body.artist);
  const album = validateOptionalString(body.album);

  const artworkResult = validateArtworkUrl(body.artwork);
  if (!artworkResult.ok) return artworkResult.response;

  const tagsResult = validateTags(body.tags);
  if (!tagsResult.ok) return tagsResult.response;

  const volumeBoostResult = validateVolumeBoost(body.volumeBoost);
  if (!volumeBoostResult.ok) return volumeBoostResult.response;
  const volumeBoost = volumeBoostResult.value !== undefined ? volumeBoostResult.value : null;

  const urlResult = validateSourceUrl(body.sourceUrl);
  if (!urlResult.ok) return urlResult.response;
  const originalUrl = urlResult.value;

  // Strip any ?list=... query param so YouTube video URLs with a playlist
  // parameter (e.g. youtu.be/VIDEO_ID?list=MIX_ID) aren't misdetected as
  // a full playlist import. Skip stripping when the client explicitly requests
  // a playlist import via type: 'playlist'.
  let url = originalUrl;
  const explicitPlaylist = (body as { type?: string }).type === 'playlist';
  if (!explicitPlaylist) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('list');
      url = parsed.toString();
    } catch {
      // leave URL unchanged
    }
  }

  const autoApprove = await userCanAutoApprove(ctx);
  const isPlaylist = isPlaylistUrl(url);

  // --- Playlist request ---
  if (isPlaylist) {
    const playlistResult = await fetchPlaylistMetadata(url, 100);
    if (!playlistResult.ok) return playlistResult.response;
    const pm = playlistResult.value;

    if (autoApprove) {
      // Auto-approve: import all tracks as songs directly
      const videosWithUrls = pm.videos.map((v) => ({
        ...v,
        canonicalUrl: youTubeUrl(v.id),
      }));

      // Deduplicate against existing songs
      const sourceIds = videosWithUrls.map((v) => v.id);
      const sourceUrls = videosWithUrls.map((v) => v.canonicalUrl);
      const existingSourceIds = await db
        .select({ sourceId: songTable.sourceId })
        .from(songTable)
        .where(
          or(
            sourceIds.length > 0 ? inArray(songTable.sourceId, sourceIds) : undefined,
            sourceUrls.length > 0 ? inArray(songTable.sourceUrl, sourceUrls) : undefined
          )
        );

      const existingIdSet = new Set(existingSourceIds.map((s) => s.sourceId));
      const newVideos = videosWithUrls.filter((v) => !existingIdSet.has(v.id));

      if (newVideos.length === 0) {
        return json({ error: 'All songs from this playlist are already in your library.' }, 409);
      }

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
              addedBy: user.discordId,
              artist: video.artist ?? null,
              artwork: video.artworkUrl ?? null,
            }))
          )
          .returning();
      });

      // Emit socket events
      const nameMap = await resolveDisplayNames(createdSongs);
      for (const song of createdSongs) {
        emitSongAdded({
          ...formatSong(song),
          addedByDisplayName: nameMap.get(song.addedBy) ?? song.addedBy,
        });
      }

      // Record the auto-approved playlist request for history
      const playlistThumb = pm.videos[0]?.thumbnailUrl ?? '';
      const now = new Date();
      const [reqRow] = await db
        .insert(requestTable)
        .values({
          sourceUrl: url,
          sourceId: `playlist-${Date.now()}`,
          title: pm.title,
          duration: pm.videos.reduce((sum, v) => sum + (v.duration || 0), 0),
          thumbnailUrl: playlistThumb,
          artist: null,
          artworkUrl: null,
          sourceName: 'playlist',
          requestedBy: user.discordId,
          notifyDm: false,
          type: 'playlist',
          playlistData: {
            name: pm.title,
            videoCount: pm.videoCount,
            thumbnailUrl: playlistThumb || null,
            videos: pm.videos.map((v) => ({
              id: v.id,
              title: v.title,
              duration: v.duration,
              thumbnailUrl: v.thumbnailUrl ?? null,
              artist: v.artist ?? null,
              artworkUrl: v.artworkUrl ?? null,
            })),
          },
          status: 'approved',
          reviewedBy: user.discordId,
          createdAt: now,
          closedAt: now,
        })
        .returning();

      // Notify the request channel
      if (reqRow) {
        void (async () => {
          try {
            await sendRequestNotification('approved', formatRequest(reqRow), user, ctx);
          } catch (err) {
            logger.warn({ err }, 'Failed to send playlist auto-approve notification');
          }
        })();
      }

      return json(
        {
          autoApproved: true,
          songs: createdSongs.map(formatSong),
          importedCount: createdSongs.length,
          skippedCount: pm.videos.length - newVideos.length,
          playlistTitle: pm.title,
        },
        201
      );
    }

    // Pending playlist request
    const playlistThumb2 = pm.videos[0]?.thumbnailUrl ?? '';
    const playlistData = {
      name: pm.title,
      videoCount: pm.videoCount,
      thumbnailUrl: playlistThumb2 || null,
      videos: pm.videos.map((v) => ({
        id: v.id,
        title: v.title,
        duration: v.duration,
        thumbnailUrl: v.thumbnailUrl ?? null,
        artist: v.artist ?? null,
        artworkUrl: v.artworkUrl ?? null,
      })),
    };

    const [created] = await db
      .insert(requestTable)
      .values({
        sourceUrl: url,
        sourceId: `playlist-${Date.now()}`,
        title: pm.title,
        duration: pm.videos.reduce((sum, v) => sum + (v.duration || 0), 0),
        thumbnailUrl: playlistThumb2,
        artist: null,
        artworkUrl: null,
        sourceName: 'playlist',
        requestedBy: user.discordId,
        notifyDm,
        type: 'playlist',
        playlistData,
        status: 'pending',
      })
      .returning();

    if (!created) {
      return json({ error: 'Failed to create request.' }, 500);
    }

    const formatted = formatRequest(created);
    await sendRequestNotification('new', formatted, user, ctx);

    return json({ request: formatted, autoApproved: false }, 201);
  }

  // --- Track request ---
  const metadataResult = await fetchSourceMetadata(url);
  if (!metadataResult.ok) return metadataResult.response;
  const metadata = metadataResult.value;

  // Check duplicates: Song table
  const [existingSong] = await db
    .select()
    .from(songTable)
    .where(eq(songTable.sourceId, metadata.sourceId))
    .limit(1);

  if (existingSong) {
    return json(
      { error: 'This song is already in your library.', song: formatSong(existingSong) },
      409
    );
  }

  // Check duplicates: only block on pending requests. Completed (approved/denied)
  // requests don't prevent re-requesting — the song may have been deleted since.
  const [existingReq] = await db
    .select()
    .from(requestTable)
    .where(and(eq(requestTable.sourceId, metadata.sourceId), eq(requestTable.status, 'pending')))
    .limit(1);

  if (existingReq) {
    return json({ error: 'This song has already been requested.' }, 409);
  }

  if (autoApprove) {
    // Auto-approve: create Song directly
    const tagValues = tagsResult.value.length > 0 ? await canonicalizeTags(tagsResult.value) : [];

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
        artist: artist ?? metadata.artist ?? null,
        album: album ?? null,
        artwork: artworkResult.value ?? metadata.artworkUrl ?? null,
        tags: tagValues,
        volumeBoost,
      })
      .returning();

    if (!song) {
      return json({ error: 'Failed to create song.' }, 500);
    }

    const formatted = formatSong(song);
    const displayName = await getUserDisplayName(user.discordId);
    const enriched = { ...formatted, addedByDisplayName: displayName };
    emitSongAdded(enriched);

    // Record the auto-approved request for history
    const now = new Date();
    const [reqRow] = await db
      .insert(requestTable)
      .values({
        sourceUrl: url,
        sourceId: metadata.sourceId,
        title: metadata.title,
        duration: metadata.duration,
        thumbnailUrl: metadata.thumbnailUrl ?? '',
        artist: metadata.artist ?? null,
        artworkUrl: metadata.artworkUrl ?? null,
        sourceName: metadata.sourceName ?? null,
        requestedBy: user.discordId,
        notifyDm,
        type: 'track',
        status: 'approved',
        reviewedBy: user.discordId,
        createdAt: now,
        closedAt: now,
      })
      .returning();

    // Notify the request channel
    if (reqRow) {
      void (async () => {
        try {
          await sendRequestNotification('approved', formatRequest(reqRow), user, ctx);
        } catch (err) {
          logger.warn({ err }, 'Failed to send auto-approve notification');
        }
      })();
    }

    // Send DM if requested
    if (notifyDm) {
      try {
        await sendRequestDm(user.discordId, 'approved', metadata.title);
      } catch (err) {
        logger.warn({ err }, 'Failed to send auto-approve DM');
      }
    }

    return json({ song: enriched, autoApproved: true }, 201);
  }

  // Pending track request
  const [created] = await db
    .insert(requestTable)
    .values({
      sourceUrl: url,
      sourceId: metadata.sourceId,
      title: metadata.title,
      duration: metadata.duration,
      thumbnailUrl: metadata.thumbnailUrl ?? '',
      artist: metadata.artist ?? null,
      artworkUrl: metadata.artworkUrl ?? null,
      sourceName: metadata.sourceName ?? null,
      requestedBy: user.discordId,
      notifyDm,
      type: 'track',
      status: 'pending',
    })
    .returning();

  if (!created) {
    return json({ error: 'Failed to create request.' }, 500);
  }

  const formatted = formatRequest(created);
  await sendRequestNotification('new', formatted, user, ctx);

  return json({ request: formatted, autoApproved: false }, 201);
}

// ---------------------------------------------------------------------------
// GET /api/requests — list requests.
// ?status=pending|approved|denied|all  (defaults to 'pending')
// ?mine=true (filter to own requests)
// ---------------------------------------------------------------------------
async function handleGetRequests(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

  const url = new URL(request.url);
  const { page, limit, skip } = parsePagination(url);
  const status = url.searchParams.get('status') ?? 'pending';
  const mine = url.searchParams.get('mine') === 'true';

  const conditions = [];

  if (status !== 'all') {
    conditions.push(eq(requestTable.status, status));
  }

  if (mine) {
    conditions.push(eq(requestTable.requestedBy, user.discordId));
  } else if (!ctx.isAdmin && status !== 'pending') {
    // Non-admin users can only see their own closed (approved/denied) requests
    conditions.push(eq(requestTable.requestedBy, user.discordId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [requests, countResult] = await Promise.all([
    db
      .select()
      .from(requestTable)
      .where(where)
      .orderBy(sql`"createdAt" DESC`)
      .offset(skip)
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)` })
      .from(requestTable)
      .where(where),
  ]);

  const total = parseInt(String(countResult[0]?.count ?? 0), 10);

  // Resolve display names for requesters
  const nameMap = await resolveDisplayNames(
    requests.map((r) => ({ addedBy: r.requestedBy }) as { addedBy: string })
  );

  const formattedRequests = requests.map((r) => ({
    ...formatRequest(r),
    requestedByDisplayName: nameMap.get(r.requestedBy) ?? r.requestedBy,
  }));

  return json({
    items: formattedRequests,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/requests/:id — approve or deny a request. Admin only.
// ---------------------------------------------------------------------------
async function handlePatchRequest(
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
): Promise<Response> {
  const { id } = params;
  const guards = checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: { status?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (body.status !== 'approved' && body.status !== 'denied') {
    return json({ error: 'status must be "approved" or "denied".' }, 400);
  }

  const [existing] = await db.select().from(requestTable).where(eq(requestTable.id, id)).limit(1);

  if (!existing) {
    return json({ error: 'Request not found.' }, 404);
  }

  if (existing.status !== 'pending') {
    return json({ error: 'This request has already been processed.' }, 409);
  }

  const newStatus = body.status as 'approved' | 'denied';
  const closedAt = new Date();

  if (newStatus === 'denied') {
    // Deny: update status
    await db
      .update(requestTable)
      .set({ status: 'denied', reviewedBy: user.discordId, closedAt })
      .where(eq(requestTable.id, id));

    const formatted = formatRequest({
      ...existing,
      status: 'denied',
      reviewedBy: user.discordId,
      closedAt,
    });

    // Notify the request channel
    void (async () => {
      try {
        await sendRequestNotification('denied', formatted, user, ctx);
      } catch (err) {
        logger.warn({ err }, 'Failed to send denied notification');
      }
    })();

    // Send DM if requested
    if (existing.notifyDm) {
      try {
        await sendRequestDm(existing.requestedBy, 'denied', existing.title);
      } catch (err) {
        logger.warn({ err }, 'Failed to send denied DM');
      }
    }

    return json({ request: formatted });
  }

  // Approve
  if (existing.type === 'playlist' && existing.playlistData) {
    const pd = existing.playlistData as NonNullable<typeof existing.playlistData>;
    const videos = pd.videos ?? [];

    if (videos.length === 0) {
      return json({ error: 'Playlist request has no videos.' }, 400);
    }

    // Deduplicate against existing songs
    const videoIds = videos.map((v) => v.id);
    const existingSourceIds = await db
      .select({ sourceId: songTable.sourceId })
      .from(songTable)
      .where(videoIds.length > 0 ? inArray(songTable.sourceId, videoIds) : undefined);

    const existingIdSet = new Set(existingSourceIds.map((s) => s.sourceId));
    const newVideos = videos.filter((v) => !existingIdSet.has(v.id));

    let createdSongs: (typeof songTable.$inferSelect)[] = [];
    if (newVideos.length > 0) {
      createdSongs = await db.transaction((tx) => {
        return tx
          .insert(songTable)
          .values(
            newVideos.map((v) => ({
              title: v.title,
              sourceUrl: youTubeUrl(v.id),
              sourceId: v.id,
              duration: v.duration,
              thumbnailUrl: v.thumbnailUrl ?? '',
              addedBy: existing.requestedBy,
              artist: v.artist ?? null,
              artwork: v.artworkUrl ?? null,
            }))
          )
          .returning();
      });
    }

    // Mark request approved
    await db
      .update(requestTable)
      .set({ status: 'approved', reviewedBy: user.discordId, closedAt })
      .where(eq(requestTable.id, id));

    // Emit socket events
    const nameMap = await resolveDisplayNames(createdSongs);
    for (const song of createdSongs) {
      emitSongAdded({
        ...formatSong(song),
        addedByDisplayName: nameMap.get(song.addedBy) ?? song.addedBy,
      });
    }

    // Send DM if requested
    if (existing.notifyDm) {
      try {
        await sendRequestDm(existing.requestedBy, 'approved', existing.title);
      } catch (err) {
        logger.warn({ err }, 'Failed to send approved DM');
      }
    }

    const formatted = formatRequest({
      ...existing,
      status: 'approved',
      reviewedBy: user.discordId,
      closedAt,
    });

    // Notify the request channel
    void (async () => {
      try {
        await sendRequestNotification('approved', formatted, user, ctx);
      } catch (err) {
        logger.warn({ err }, 'Failed to send playlist approved notification');
      }
    })();

    return json({
      request: formatted,
      songs: createdSongs.map(formatSong),
      importedCount: createdSongs.length,
      skippedCount: videos.length - newVideos.length,
    });
  }

  // Track approval: create Song from request
  const [newSong] = await db
    .insert(songTable)
    .values({
      title: existing.title,
      sourceUrl: existing.sourceUrl,
      sourceId: existing.sourceId,
      duration: existing.duration,
      thumbnailUrl: existing.thumbnailUrl,
      addedBy: existing.requestedBy,
      artist: existing.artist ?? null,
      artwork: existing.artworkUrl ?? null,
    })
    .returning();

  if (!newSong) {
    return json({ error: 'Failed to create song from request.' }, 500);
  }

  // Mark request approved
  await db
    .update(requestTable)
    .set({ status: 'approved', reviewedBy: user.discordId, closedAt })
    .where(eq(requestTable.id, id));

  // Emit socket event
  const displayName = await getUserDisplayName(existing.requestedBy);
  emitSongAdded({
    ...formatSong(newSong),
    addedByDisplayName: displayName,
  });

  // Send DM if requested
  if (existing.notifyDm) {
    try {
      await sendRequestDm(existing.requestedBy, 'approved', existing.title);
    } catch (err) {
      logger.warn({ err }, 'Failed to send approved DM');
    }
  }

  const formatted = formatRequest({
    ...existing,
    status: 'approved',
    reviewedBy: user.discordId,
    closedAt,
  });

  // Notify the request channel
  void (async () => {
    try {
      await sendRequestNotification('approved', formatted, user, ctx);
    } catch (err) {
      logger.warn({ err }, 'Failed to send approved notification');
    }
  })();

  return json({
    request: formatted,
    song: formatSong(newSong),
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/requests/:id — cancel own pending request.
// ---------------------------------------------------------------------------
async function handleDeleteRequest(
  ctx: RouteContext,
  _request: Request,
  params: Record<string, string>
): Promise<Response> {
  const { id } = params;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) return guards;
  const { user } = guards;

  const [existing] = await db.select().from(requestTable).where(eq(requestTable.id, id)).limit(1);

  if (!existing) {
    return json({ error: 'Request not found.' }, 404);
  }

  if (existing.status !== 'pending') {
    return json({ error: 'Only pending requests can be cancelled.' }, 409);
  }

  if (existing.requestedBy !== user.discordId && !ctx.isAdmin) {
    return json({ error: 'You can only cancel your own requests.' }, 403);
  }

  await db.delete(requestTable).where(eq(requestTable.id, id));

  return new Response(null, { status: 204 });
}

export const handleRequests = routeTable('/api/requests', {
  routes: [
    ['POST', '/preview', handlePreviewRequest],
    ['GET', '/', handleGetRequests],
    ['POST', '/', handleCreateRequest],
    ['PATCH', '/:id', handlePatchRequest],
    ['DELETE', '/:id', handleDeleteRequest],
  ],
});
