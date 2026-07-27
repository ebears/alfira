import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { requireAdmin, requireAuth } from '../lib/elysia-guards';
import { sendRequestDm, sendRequestNotification } from '../lib/notifications';
import { parsePagination } from '../lib/pagination';
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
import { type SongRequest } from '../shared/types';
import { isPlaylistUrl } from '../startDiscord';

const { song: songTable, songRequest: requestTable } = tables;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRequest(row: typeof requestTable.$inferSelect): SongRequest {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
    playlistData: row.playlistData,
    type: row.type === 'playlist' ? 'playlist' : 'track',
  } as SongRequest;
}

async function userCanAutoApprove(ctx: Record<string, unknown>): Promise<boolean> {
  if (ctx.isAdmin as boolean) {
    return true;
  }
  const user = ctx.user as { discordId?: string; roles?: string[] } | null;
  if (!user) {
    return false;
  }
  const userRoles = user.roles ?? [];
  if (userRoles.length === 0) {
    return false;
  }

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
// Schemas
// ---------------------------------------------------------------------------

const PreviewRequestSchema = v.object({
  url: v.string(),
});

const CreateRequestSchema = v.partial(
  v.object({
    sourceUrl: v.unknown(),
    notifyDm: v.unknown(),
    nickname: v.unknown(),
    artist: v.unknown(),
    album: v.unknown(),
    artwork: v.unknown(),
    tags: v.unknown(),
    volumeBoost: v.unknown(),
    type: v.optional(v.union([v.literal('track'), v.literal('playlist')])),
  })
);

const PatchRequestSchema = v.object({
  status: v.union([v.literal('approved'), v.literal('denied')]),
});

// ---------------------------------------------------------------------------
// Handlers — POST /requests/preview
// ---------------------------------------------------------------------------

async function handlePreviewRequest(ctx: Record<string, unknown>): Promise<Response> {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  const body = ctx.body as v.InferOutput<typeof PreviewRequestSchema>;
  const urlResult = validateSourceUrl(body.url);
  if (!urlResult.ok) {
    return urlResult.response;
  }
  let url = urlResult.value;

  // Strip any ?list=... query param
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
    if (!playlistResult.ok) {
      return playlistResult.response;
    }
    const pm = playlistResult.value;

    const playlistThumb = pm.videos[0]?.thumbnailUrl ?? '';
    return json({
      title: pm.title,
      sourceId: `playlist-${Date.now()}`,
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
  if (!metadataResult.ok) {
    return metadataResult.response;
  }
  const metadata = metadataResult.value;

  const [existing] = await db
    .select()
    .from(songTable)
    .where(eq(songTable.sourceId, metadata.sourceId))
    .limit(1);

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
// Handlers — POST /requests
// ---------------------------------------------------------------------------

async function handleCreateRequest(ctx: Record<string, unknown>): Promise<Response> {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  const body = ctx.body as Record<string, unknown>;
  const user = ctx.user as {
    discordId: string;
    username: string;
    isAdmin: boolean;
  };

  const notifyDm = body.notifyDm === true;

  const nicknameResult = validateNickname(body.nickname);
  if (!nicknameResult.ok) {
    return nicknameResult.response;
  }

  const artist = validateOptionalString(body.artist);
  const album = validateOptionalString(body.album);

  const artworkResult = validateArtworkUrl(body.artwork);
  if (!artworkResult.ok) {
    return artworkResult.response;
  }

  const tagsResult = validateTags(body.tags);
  if (!tagsResult.ok) {
    return tagsResult.response;
  }

  const volumeBoostResult = validateVolumeBoost(body.volumeBoost);
  if (!volumeBoostResult.ok) {
    return volumeBoostResult.response;
  }
  const volumeBoost = volumeBoostResult.value !== undefined ? volumeBoostResult.value : null;

  const urlResult = validateSourceUrl(body.sourceUrl);
  if (!urlResult.ok) {
    return urlResult.response;
  }
  const originalUrl = urlResult.value;

  // Strip ?list= param unless explicit playlist type
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
    if (!playlistResult.ok) {
      return playlistResult.response;
    }
    const pm = playlistResult.value;

    if (autoApprove) {
      const videosWithUrls = pm.videos.map((v) => ({
        ...v,
        canonicalUrl: youTubeUrl(v.id),
      }));

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

      const nameMap = await resolveDisplayNames(createdSongs as unknown as { addedBy: string }[]);
      for (const song of createdSongs) {
        emitSongAdded({
          ...formatSong(song),
          addedByDisplayName: nameMap.get(song.addedBy) ?? song.addedBy,
        });
      }

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

      if (reqRow) {
        void (async () => {
          try {
            await sendRequestNotification('approved', formatRequest(reqRow), user);
          } catch (error) {
            logger.warn({ error }, 'Failed to send playlist auto-approve notification');
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
    await sendRequestNotification('new', formatted, user);

    return json({ request: formatted, autoApproved: false }, 201);
  }

  // --- Track request ---
  const metadataResult = await fetchSourceMetadata(url);
  if (!metadataResult.ok) {
    return metadataResult.response;
  }
  const metadata = metadataResult.value;

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

  const [existingReq] = await db
    .select()
    .from(requestTable)
    .where(and(eq(requestTable.sourceId, metadata.sourceId), eq(requestTable.status, 'pending')))
    .limit(1);

  if (existingReq) {
    return json({ error: 'This song has already been requested.' }, 409);
  }

  if (autoApprove) {
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

    if (reqRow) {
      void (async () => {
        try {
          await sendRequestNotification('approved', formatRequest(reqRow), user);
        } catch (error) {
          logger.warn({ error }, 'Failed to send auto-approve notification');
        }
      })();
    }

    if (notifyDm) {
      try {
        await sendRequestDm(user.discordId, 'approved', metadata.title);
      } catch (error) {
        logger.warn({ error }, 'Failed to send auto-approve DM');
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
  await sendRequestNotification('new', formatted, user);

  return json({ request: formatted, autoApproved: false }, 201);
}

// ---------------------------------------------------------------------------
// Handlers — GET /requests
// ---------------------------------------------------------------------------

async function handleGetRequests(ctx: Record<string, unknown>): Promise<Response> {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  const url = new URL((ctx.request as Request).url);
  const { page, limit, skip } = parsePagination(url);
  const status = url.searchParams.get('status') ?? 'pending';
  const mine = url.searchParams.get('mine') === 'true';

  const user = ctx.user as { discordId: string; isAdmin: boolean };
  const isAdmin = ctx.isAdmin as boolean;

  const conditions = [];

  if (status !== 'all') {
    conditions.push(eq(requestTable.status, status));
  }

  if (mine) {
    conditions.push(eq(requestTable.requestedBy, user.discordId));
  } else if (!isAdmin && status !== 'pending') {
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

  const total = Math.trunc(Number(String(countResult[0]?.count ?? 0)));

  const nameMap = await resolveDisplayNames(
    requests.map((r) => ({ addedBy: r.requestedBy })) as { addedBy: string }[]
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
// Handlers — PATCH /requests/:id
// ---------------------------------------------------------------------------

async function handlePatchRequest(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdmin({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (guardErr) {
    return guardErr;
  }

  const id = (ctx.params as Record<string, string>).id as string;
  const body = ctx.body as v.InferOutput<typeof PatchRequestSchema>;
  const user = ctx.user as { discordId: string; username: string; isAdmin: boolean };

  const [existing] = (await db
    .select()
    .from(requestTable)
    .where(eq(requestTable.id, id))
    .limit(1)) as unknown as [typeof requestTable.$inferSelect | undefined];

  if (!existing) {
    return json({ error: 'Request not found.' }, 404);
  }

  if (existing.status !== 'pending') {
    return json({ error: 'This request has already been processed.' }, 409);
  }

  const newStatus = body.status;
  const closedAt = new Date();

  if (newStatus === 'denied') {
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

    void (async () => {
      try {
        await sendRequestNotification('denied', formatted, user);
      } catch (error) {
        logger.warn({ error }, 'Failed to send denied notification');
      }
    })();

    if (existing.notifyDm) {
      try {
        await sendRequestDm(existing.requestedBy, 'denied', existing.title);
      } catch (error) {
        logger.warn({ error }, 'Failed to send denied DM');
      }
    }

    return json({ request: formatted });
  }

  // Approve
  if (existing.type === 'playlist' && existing.playlistData) {
    const pd = existing.playlistData as {
      name: string;
      videoCount: number;
      thumbnailUrl: string | null;
      videos: {
        id: string;
        title: string;
        duration: number;
        thumbnailUrl: string | null;
        artist: string | null;
        artworkUrl: string | null;
      }[];
    };
    const videos = pd.videos ?? [];

    if (videos.length === 0) {
      return json({ error: 'Playlist request has no videos.' }, 400);
    }

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

    await db
      .update(requestTable)
      .set({ status: 'approved', reviewedBy: user.discordId, closedAt })
      .where(eq(requestTable.id, id));

    const nameMap = await resolveDisplayNames(createdSongs as unknown as { addedBy: string }[]);
    for (const song of createdSongs) {
      emitSongAdded({
        ...formatSong(song),
        addedByDisplayName: nameMap.get(song.addedBy) ?? song.addedBy,
      });
    }

    if (existing.notifyDm) {
      try {
        await sendRequestDm(existing.requestedBy, 'approved', existing.title);
      } catch (error) {
        logger.warn({ error }, 'Failed to send approved DM');
      }
    }

    const formatted = formatRequest({
      ...existing,
      status: 'approved',
      reviewedBy: user.discordId,
      closedAt,
    });

    void (async () => {
      try {
        await sendRequestNotification('approved', formatted, user);
      } catch (error) {
        logger.warn({ error }, 'Failed to send playlist approved notification');
      }
    })();

    return json({
      request: formatted,
      songs: createdSongs.map(formatSong),
      importedCount: createdSongs.length,
      skippedCount: videos.length - newVideos.length,
    });
  }

  // Track approval
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

  await db
    .update(requestTable)
    .set({ status: 'approved', reviewedBy: user.discordId, closedAt })
    .where(eq(requestTable.id, id));

  const displayName = await getUserDisplayName(existing.requestedBy);
  emitSongAdded({
    ...formatSong(newSong),
    addedByDisplayName: displayName,
  });

  if (existing.notifyDm) {
    try {
      await sendRequestDm(existing.requestedBy, 'approved', existing.title);
    } catch (error) {
      logger.warn({ error }, 'Failed to send approved DM');
    }
  }

  const formatted = formatRequest({
    ...existing,
    status: 'approved',
    reviewedBy: user.discordId,
    closedAt,
  });

  void (async () => {
    try {
      await sendRequestNotification('approved', formatted, user);
    } catch (error) {
      logger.warn({ error }, 'Failed to send approved notification');
    }
  })();

  return json({
    request: formatted,
    song: formatSong(newSong),
  });
}

// ---------------------------------------------------------------------------
// Handlers — DELETE /requests/:id
// ---------------------------------------------------------------------------

async function handleDeleteRequest(ctx: Record<string, unknown>): Promise<Response> {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  const id = (ctx.params as Record<string, string>).id as string;
  const user = ctx.user as { discordId: string; isAdmin: boolean };

  const [existing] = (await db
    .select()
    .from(requestTable)
    .where(eq(requestTable.id, id))
    .limit(1)) as unknown as [typeof requestTable.$inferSelect | undefined];

  if (!existing) {
    return json({ error: 'Request not found.' }, 404);
  }

  if (existing.status !== 'pending') {
    return json({ error: 'Only pending requests can be cancelled.' }, 409);
  }

  if (existing.requestedBy !== user.discordId && !user.isAdmin) {
    return json({ error: 'You can only cancel your own requests.' }, 403);
  }

  await db.delete(requestTable).where(eq(requestTable.id, id));

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function requestsPlugin(app: Elysia): Elysia {
  return app
    .post('/requests/preview', handlePreviewRequest as never, {
      body: PreviewRequestSchema,
    })
    .get('/requests', handleGetRequests as never)
    .post('/requests', handleCreateRequest as never, {
      body: CreateRequestSchema,
    })
    .patch('/requests/:id', handlePatchRequest as never, {
      body: PatchRequestSchema,
    })
    .delete('/requests/:id', handleDeleteRequest as never) as unknown as Elysia;
}
