import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { authPlugin, requireAuth } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import { sendRequestDm, sendRequestNotification } from '../lib/notifications';
import { parsePagination } from '../lib/pagination';
import {
  CreateRequestResult,
  RequestPreview,
  SongRequest as SongRequestSchema,
} from '../lib/responseSchemas';
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
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    playlistData: row.playlistData,
    type: row.type === 'playlist' ? 'playlist' : 'track',
  } as SongRequest;
}

async function userCanAutoApprove(user: { isAdmin: boolean; roles?: string[] }): Promise<boolean> {
  if (user.isAdmin) {
    return true;
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

const PreviewRequestSchema = t.Object({
  url: t.String(),
});

const CreateRequestSchema = t.Partial(
  t.Object({
    sourceUrl: t.String(),
    notifyDm: t.Boolean(),
    nickname: t.Nullable(t.String()),
    artist: t.Nullable(t.String()),
    album: t.Nullable(t.String()),
    artwork: t.Nullable(t.String()),
    tags: t.Array(t.String()),
    volumeBoost: t.Nullable(t.Integer({ minimum: -100, maximum: 200 })),
    type: t.Optional(t.Union([t.Literal('track'), t.Literal('playlist')])),
  })
);

const PatchRequestSchema = t.Object({
  status: t.Union([t.Literal('approved'), t.Literal('denied')]),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const requestsPlugin = new Elysia({ prefix: '/requests', name: 'requests' })
  .use(authPlugin)
  .use(requireAuth)
  .post(
    '/preview',
    async ({ body }) => {
      let url = validateSourceUrl(body.url);

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
        const pm = await fetchPlaylistMetadata(url, 100);

        const playlistThumb = pm.videos[0]?.thumbnailUrl ?? '';
        return {
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
        };
      }

      const metadata = await fetchSourceMetadata(url);

      const [existing] = await db
        .select()
        .from(songTable)
        .where(eq(songTable.sourceId, metadata.sourceId))
        .limit(1);

      const [existingReq] = await db
        .select()
        .from(requestTable)
        .where(
          and(eq(requestTable.sourceId, metadata.sourceId), eq(requestTable.status, 'pending'))
        )
        .limit(1);

      return {
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
      };
    },
    { body: PreviewRequestSchema, response: { 200: RequestPreview } }
  )
  .get(
    '/',
    async ({ user, request }) => {
      const url = new URL(request.url);
      const { page, limit, skip } = parsePagination(url);
      const status = url.searchParams.get('status') ?? 'pending';
      const mine = url.searchParams.get('mine') === 'true';

      const conditions = [];

      if (status !== 'all') {
        conditions.push(eq(requestTable.status, status));
      }

      const discordId = (user as { discordId: string }).discordId;
      if (mine) {
        conditions.push(eq(requestTable.requestedBy, discordId));
      } else if (!user.isAdmin && status !== 'pending') {
        conditions.push(eq(requestTable.requestedBy, discordId));
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

      return {
        items: formattedRequests,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
    {
      response: {
        200: t.Object({
          items: t.Array(SongRequestSchema),
          pagination: t.Object({
            page: t.Number(),
            limit: t.Number(),
            total: t.Number(),
            totalPages: t.Number(),
          }),
        }),
      },
    }
  )
  .post(
    '/',
    async ({ user, body }): Promise<typeof CreateRequestResult.static> => {
      const discordUser = user as { discordId: string; username: string; isAdmin: boolean };

      const notifyDm = body.notifyDm === true;

      const nickname = validateNickname(body.nickname);

      const artist = validateOptionalString(body.artist);
      const album = validateOptionalString(body.album);

      const artwork = validateArtworkUrl(body.artwork);

      const rawTags = validateTags(body.tags);

      const volumeBoostValue = validateVolumeBoost(body.volumeBoost);
      const volumeBoost = volumeBoostValue !== undefined ? volumeBoostValue : null;

      const originalUrl = validateSourceUrl(body.sourceUrl);

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

      const autoApprove = await userCanAutoApprove(user);
      const isPlaylist = isPlaylistUrl(url);

      // --- Playlist request ---
      if (isPlaylist) {
        const pm = await fetchPlaylistMetadata(url, 100);

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
            throw new ApiError(409, 'All songs from this playlist are already in your library.');
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
                  addedBy: discordUser.discordId,
                  artist: video.artist ?? null,
                  artwork: video.artworkUrl ?? null,
                }))
              )
              .returning();
          });

          const nameMap = await resolveDisplayNames(
            createdSongs as unknown as { addedBy: string }[]
          );
          for (const song of createdSongs) {
            emitSongAdded({
              ...formatSong(song),
              addedByDisplayName: nameMap.get(song.addedBy) ?? song.addedBy,
            });
          }

          const playlistThumb = pm.videos[0]?.thumbnailUrl ?? '';
          const now = new Date().toISOString();
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
              requestedBy: discordUser.discordId,
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
              reviewedBy: discordUser.discordId,
              createdAt: now,
              closedAt: now,
            })
            .returning();

          if (reqRow) {
            void (async () => {
              try {
                await sendRequestNotification('approved', formatRequest(reqRow), discordUser);
              } catch (error) {
                logger.warn({ error }, 'Failed to send playlist auto-approve notification');
              }
            })();
          }

          return {
            autoApproved: true,
            songs: createdSongs.map(formatSong),
            importedCount: createdSongs.length,
            skippedCount: pm.videos.length - newVideos.length,
            playlistTitle: pm.title,
          } as typeof CreateRequestResult.static;
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
            requestedBy: discordUser.discordId,
            notifyDm,
            type: 'playlist',
            playlistData,
            status: 'pending',
          })
          .returning();

        if (!created) {
          throw new ApiError(500, 'Failed to create request.');
        }

        const formatted = formatRequest(created);
        await sendRequestNotification('new', formatted, discordUser);

        return {
          request: formatted,
          autoApproved: false,
        } as unknown as typeof CreateRequestResult.static;
      }

      // --- Track request ---
      const metadata = await fetchSourceMetadata(url);

      const [existingSong] = await db
        .select()
        .from(songTable)
        .where(eq(songTable.sourceId, metadata.sourceId))
        .limit(1);

      if (existingSong) {
        throw new ApiError(409, 'This song is already in your library.');
      }

      const [existingReq] = await db
        .select()
        .from(requestTable)
        .where(
          and(eq(requestTable.sourceId, metadata.sourceId), eq(requestTable.status, 'pending'))
        )
        .limit(1);

      if (existingReq) {
        throw new ApiError(409, 'This song has already been requested.');
      }

      if (autoApprove) {
        const tagValues = rawTags.length > 0 ? await canonicalizeTags(rawTags) : [];

        const [song] = await db
          .insert(songTable)
          .values({
            title: metadata.title,
            sourceUrl: url,
            sourceId: metadata.sourceId,
            duration: metadata.duration,
            thumbnailUrl: metadata.thumbnailUrl ?? '',
            addedBy: discordUser.discordId,
            nickname,
            artist: artist ?? metadata.artist ?? null,
            album: album ?? null,
            artwork: artwork ?? metadata.artworkUrl ?? null,
            tags: tagValues,
            volumeBoost,
          })
          .returning();

        if (!song) {
          throw new ApiError(500, 'Failed to create song.');
        }

        const formatted = formatSong(song);
        const displayName = await getUserDisplayName(discordUser.discordId);
        const enriched = { ...formatted, addedByDisplayName: displayName };
        emitSongAdded(enriched);

        const now = new Date().toISOString();
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
            requestedBy: discordUser.discordId,
            notifyDm,
            type: 'track',
            status: 'approved',
            reviewedBy: discordUser.discordId,
            createdAt: now,
            closedAt: now,
          })
          .returning();

        if (reqRow) {
          void (async () => {
            try {
              await sendRequestNotification('approved', formatRequest(reqRow), discordUser);
            } catch (error) {
              logger.warn({ error }, 'Failed to send auto-approve notification');
            }
          })();
        }

        if (notifyDm) {
          try {
            await sendRequestDm(discordUser.discordId, 'approved', metadata.title);
          } catch (error) {
            logger.warn({ error }, 'Failed to send auto-approve DM');
          }
        }

        return { song: enriched, autoApproved: true } as typeof CreateRequestResult.static;
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
          requestedBy: discordUser.discordId,
          notifyDm,
          type: 'track',
          status: 'pending',
        })
        .returning();

      if (!created) {
        throw new ApiError(500, 'Failed to create request.');
      }

      const formatted = formatRequest(created);
      await sendRequestNotification('new', formatted, discordUser);

      return {
        request: formatted,
        autoApproved: false,
      } as unknown as typeof CreateRequestResult.static;
    },
    { body: CreateRequestSchema, response: { 200: CreateRequestResult } }
  )
  .guard({}, (app) =>
    app.patch(
      '/:id',
      async ({ user, params, body }) => {
        const id = params.id;

        const [existing] = (await db
          .select()
          .from(requestTable)
          .where(eq(requestTable.id, id))
          .limit(1)) as unknown as [typeof requestTable.$inferSelect | undefined];

        if (!existing) {
          throw new ApiError(404, 'Request not found.');
        }

        if (existing.status !== 'pending') {
          throw new ApiError(409, 'This request has already been processed.');
        }

        const newStatus = body.status;
        const closedAt = new Date().toISOString();
        const reviewUser = user as { discordId: string; username: string; isAdmin: boolean };

        if (newStatus === 'denied') {
          await db
            .update(requestTable)
            .set({ status: 'denied', reviewedBy: reviewUser.discordId, closedAt })
            .where(eq(requestTable.id, id));

          const formatted = formatRequest({
            ...existing,
            status: 'denied',
            reviewedBy: reviewUser.discordId,
            closedAt,
          });

          void (async () => {
            try {
              await sendRequestNotification('denied', formatted, reviewUser);
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

          return { request: formatted };
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
            throw new ApiError(400, 'Playlist request has no videos.');
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
            .set({ status: 'approved', reviewedBy: reviewUser.discordId, closedAt })
            .where(eq(requestTable.id, id));

          const nameMap = await resolveDisplayNames(
            createdSongs as unknown as { addedBy: string }[]
          );
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
            reviewedBy: reviewUser.discordId,
            closedAt,
          });

          void (async () => {
            try {
              await sendRequestNotification('approved', formatted, reviewUser);
            } catch (error) {
              logger.warn({ error }, 'Failed to send playlist approved notification');
            }
          })();

          return {
            request: formatted,
            songs: createdSongs.map(formatSong),
            importedCount: createdSongs.length,
            skippedCount: videos.length - newVideos.length,
          };
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
          throw new ApiError(500, 'Failed to create song from request.');
        }

        await db
          .update(requestTable)
          .set({ status: 'approved', reviewedBy: reviewUser.discordId, closedAt })
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
          reviewedBy: reviewUser.discordId,
          closedAt,
        });

        void (async () => {
          try {
            await sendRequestNotification('approved', formatted, reviewUser);
          } catch (error) {
            logger.warn({ error }, 'Failed to send approved notification');
          }
        })();

        return {
          request: formatted,
          song: formatSong(newSong),
        };
      },
      {
        isAdmin: true,
        params: t.Object({ id: t.String() }),
        body: PatchRequestSchema,
        response: { 200: t.Unknown() },
      }
    )
  )
  .delete(
    '/:id',
    async ({ user, params, set }) => {
      const { isAdmin } = user as { isAdmin: boolean };
      const id = params.id;

      const [existing] = (await db
        .select()
        .from(requestTable)
        .where(eq(requestTable.id, id))
        .limit(1)) as unknown as [typeof requestTable.$inferSelect | undefined];

      if (!existing) {
        throw new ApiError(404, 'Request not found.');
      }

      if (existing.status !== 'pending') {
        throw new ApiError(409, 'Only pending requests can be cancelled.');
      }

      const reqDiscordId = (user as { discordId: string }).discordId;
      if (existing.requestedBy !== reqDiscordId && !isAdmin) {
        throw new ApiError(403, 'You can only cancel your own requests.');
      }

      await db.delete(requestTable).where(eq(requestTable.id, id));

      set.status = 204;
      return null;
    },
    { params: t.Object({ id: t.String() }), response: { 204: t.Void() } }
  );
