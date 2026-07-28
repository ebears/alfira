import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { authGuard } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import { parsePagination } from '../lib/pagination';
import { canAccessPlaylist, getPlaylistSongCount, requirePlaylist } from '../lib/playlistAccess';
import {
  BulkRemoveSongsResponse,
  MessageResponse,
  PaginationMeta,
  Playlist,
  PlaylistDetail,
  PlaylistSongEntry,
} from '../lib/responseSchemas';
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
      createdAt: song.createdAt,
      tags: song.tags ?? [],
      addedByDisplayName,
    },
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PlaylistCreateSchema = t.Object({
  name: t.Optional(t.String()),
  tagNameLower: t.Optional(t.String()),
});

const PlaylistVisibilitySchema = t.Object({
  isPrivate: t.Optional(t.Boolean()),
  adminView: t.Optional(t.Boolean()),
});

const PlaylistAddSongSchema = t.Object({
  songId: t.String(),
});

const PlaylistRemoveSongsSchema = t.Object({
  songIds: t.Array(t.String(), { minLength: 1, maxLength: 5000 }),
});

const PlaylistReorderSchema = t.Object({
  songIds: t.Array(t.String(), { minLength: 1, maxLength: 5000 }),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const playlistsPlugin = new Elysia({ prefix: '/playlists', name: 'playlists' })
  .derive(deriveAuth)

  .use(authGuard)
  .get(
    '/',
    async ({ user, request }) => {
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

      // Filter private playlists
      const filteredPlaylists = playlistsWithCounts.filter(
        (pl) => canAccessPlaylist(pl, user as { discordId: string; isAdmin: boolean }, adminView).ok
      );

      // Batch-fetch cover artwork URLs
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

      const playlistsWithCreator = await Promise.all(
        filteredPlaylists.map(async (pl) => ({
          ...pl,
          createdByDisplayName: await getUserDisplayName(pl.createdBy),
          coverUrls: coverMap.get(pl.id),
        }))
      );

      return {
        items: playlistsWithCreator,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      };
    },
    { response: { 200: t.Object({ items: t.Array(Playlist), pagination: PaginationMeta }) } }
  )
  .post(
    '/',
    async ({ user, body }) => {
      const trimmedName = validatePlaylistName(body.name);

      const tagNameLower =
        typeof body.tagNameLower === 'string' && body.tagNameLower.trim().length > 0
          ? body.tagNameLower.trim().toLowerCase()
          : null;

      const discordId = (user as { discordId: string }).discordId;
      const [playlist] = await db
        .insert(playlistTable)
        .values({
          name: trimmedName,
          createdBy: discordId,
          tagNameLower,
        })
        .returning();

      if (!playlist) {
        throw new ApiError(500, 'Failed to create playlist.');
      }

      if (tagNameLower) {
        await syncPlaylistToTag(playlist.id);
      }

      const songCount = await getPlaylistSongCount(playlist.id);
      emitPlaylistUpdated(formatPlaylist(playlist, songCount));
      return playlist;
    },
    { body: PlaylistCreateSchema, response: { 200: Playlist } }
  )
  .post(
    '/:id/songs/bulk-remove',
    async ({ user, params, body }) => {
      const playlistId = params.id;
      const { songIds } = body;

      const discordId = (user as { discordId: string }).discordId;
      const playlist = await requirePlaylist(playlistId, { discordId });

      await db.transaction(async (tx) => {
        await tx
          .delete(playlistSongTable)
          .where(
            and(
              eq(playlistSongTable.playlistId, playlistId),
              inArray(playlistSongTable.songId, songIds)
            )
          );

        const remaining = await tx
          .select()
          .from(playlistSongTable)
          .where(eq(playlistSongTable.playlistId, playlistId))
          .orderBy(playlistSongTable.position);

        await Promise.all(
          remaining.map((ps, index) =>
            tx
              .update(playlistSongTable)
              .set({ position: index })
              .where(eq(playlistSongTable.id, ps.id))
          )
        );
      });

      const value = await getPlaylistSongCount(playlistId);
      emitPlaylistUpdated(formatPlaylist(playlist, value));

      return { removed: songIds.length };
    },
    { body: PlaylistRemoveSongsSchema, response: { 200: BulkRemoveSongsResponse } }
  )
  .delete(
    '/:id/songs/:songId',
    async ({ user, params, set }) => {
      const playlistId = params.id;
      const songId = params.songId;

      const discordId = (user as { discordId: string }).discordId;
      const playlist = await requirePlaylist(playlistId, { discordId });

      const [entry] = await db
        .select()
        .from(playlistSongTable)
        .where(
          and(eq(playlistSongTable.playlistId, playlistId), eq(playlistSongTable.songId, songId))
        )
        .limit(1);

      if (!entry) {
        throw new ApiError(404, 'Song not found in playlist.');
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(playlistSongTable)
          .where(
            and(eq(playlistSongTable.playlistId, playlistId), eq(playlistSongTable.songId, songId))
          );

        const remaining = await tx
          .select()
          .from(playlistSongTable)
          .where(eq(playlistSongTable.playlistId, playlistId))
          .orderBy(playlistSongTable.position);

        await Promise.all(
          remaining.map((ps, index) =>
            tx
              .update(playlistSongTable)
              .set({ position: index })
              .where(eq(playlistSongTable.id, ps.id))
          )
        );
      });

      const value = await getPlaylistSongCount(playlistId);
      emitPlaylistUpdated(formatPlaylist(playlist, value));

      set.status = 204;
      return null;
    },
    { params: t.Object({ id: t.String(), songId: t.String() }), response: { 204: t.Void() } }
  )
  .post(
    '/:id/songs',
    async ({ user, params, body }): Promise<typeof PlaylistSongEntry.static> => {
      const id = params.id;
      const { songId } = body;

      const discordId = (user as { discordId: string }).discordId;
      const playlist = await requirePlaylist(id, { discordId });

      if (playlist.tagNameLower) {
        throw new ApiError(
          409,
          `This playlist automatically tracks the "${playlist.tagNameLower}" tag. Songs are added when tagged and cannot be added manually.`
        );
      }

      const [song] = (await db
        .select()
        .from(tables.song)
        .where(eq(tables.song.id, songId))
        .limit(1)) as unknown as [typeof tables.song.$inferSelect | undefined];
      if (!song) {
        throw new ApiError(404, 'Song not found.');
      }

      const [existingEntry] = await db
        .select()
        .from(playlistSongTable)
        .where(
          and(eq(playlistSongTable.playlistId, playlist.id), eq(playlistSongTable.songId, song.id))
        )
        .limit(1);

      if (existingEntry) {
        throw new ApiError(409, 'This song is already in the playlist.');
      }

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

      const songData = { ...song, tags: song.tags ?? [] };
      const value = await getPlaylistSongCount(playlist.id);
      emitPlaylistUpdated(formatPlaylist(playlist, value));

      return { ...ps, song: songData } as typeof PlaylistSongEntry.static;
    },
    { body: PlaylistAddSongSchema, response: { 200: PlaylistSongEntry } }
  )
  .patch(
    '/:id/visibility',
    async ({ user, params, body }) => {
      const id = params.id;

      if (body.isPrivate === undefined) {
        throw new ApiError(400, 'isPrivate (boolean) is required.');
      }

      const discordId = (user as { discordId: string }).discordId;
      const adminView = body.adminView === true;
      await requirePlaylist(id, { discordId }, adminView);

      const [updatedPlaylist] = await db
        .update(playlistTable)
        .set({ isPrivate: body.isPrivate })
        .where(eq(playlistTable.id, id))
        .returning();

      if (!updatedPlaylist) {
        throw new ApiError(500, 'Failed to update playlist.');
      }

      const value = await getPlaylistSongCount(updatedPlaylist.id);
      emitPlaylistUpdated(formatPlaylist(updatedPlaylist, value));
      return updatedPlaylist;
    },
    { body: PlaylistVisibilitySchema, response: { 200: Playlist } }
  )
  .get(
    '/:id',
    async ({ user, request, params }) => {
      const id = params.id;
      const url = new URL(request.url);
      const adminView = url.searchParams.get('adminView') === 'true';
      const discordId = (user as { discordId: string }).discordId;
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

      const playlist = await requirePlaylist(id, { discordId }, adminView, true);

      // ── Custom sort path ──
      if (wantsCustomSort || filterTags.length > 0 || filterSources.length > 0) {
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

        return {
          ...playlist,
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
        };
      }

      // ── Default path: position sort, search-only filter ──
      let songIds: string[] = [];
      if (search) {
        const matching = await db
          .select({ id: tables.song.id })
          .from(tables.song)
          .where(buildSongSearchClause(search))
          .limit(500);
        songIds = matching.map((s) => s.id);
        if (songIds.length === 0) {
          return {
            ...playlist,
            songs: [],
            createdByDisplayName: await getUserDisplayName(playlist.createdBy),
            pagination: { page, limit, total: 0, totalPages: 0 },
          };
        }
      }

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

      const playlistSongIds = playlistSongs.map((ps) => ps.songId);
      const songs =
        playlistSongIds.length > 0
          ? await db.select().from(tables.song).where(inArray(tables.song.id, playlistSongIds))
          : [];
      const songMap = new Map(songs.map((s) => [s.id, s]));

      const nameMap = await resolveDisplayNames(songs);

      return {
        ...playlist,
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
      };
    },
    { response: { 200: PlaylistDetail } }
  )
  .patch(
    '/:id',
    async ({ user, params, body }) => {
      const id = params.id;

      const discordId = (user as { discordId: string }).discordId;
      await requirePlaylist(id, { discordId });

      const data: Record<string, unknown> = {};

      if (body.name !== undefined) {
        data.name = validatePlaylistName(body.name);
      }

      if (body.tagNameLower !== undefined) {
        if (body.tagNameLower === null || body.tagNameLower === '') {
          data.tagNameLower = null;
        } else if (typeof body.tagNameLower === 'string' && body.tagNameLower.trim().length > 0) {
          data.tagNameLower = body.tagNameLower.trim().toLowerCase();
        }
      }

      if (Object.keys(data).length === 0) {
        throw new ApiError(400, 'No valid fields to update.');
      }

      const [updatedPlaylist] = await db
        .update(playlistTable)
        .set(data)
        .where(eq(playlistTable.id, id))
        .returning();

      if (!updatedPlaylist) {
        throw new ApiError(500, 'Failed to update playlist.');
      }

      if ('tagNameLower' in data) {
        await syncPlaylistToTag(updatedPlaylist.id);
      }

      const value = await getPlaylistSongCount(updatedPlaylist.id);
      emitPlaylistUpdated(formatPlaylist(updatedPlaylist, value));
      return updatedPlaylist;
    },
    { body: PlaylistCreateSchema, response: { 200: Playlist } }
  )
  .patch(
    '/:id/reorder',
    async ({ user, params, body }) => {
      const playlistId = params.id;
      const { songIds } = body;

      const discordId = (user as { discordId: string }).discordId;
      const playlist = await requirePlaylist(playlistId, { discordId });

      if (playlist.tagNameLower) {
        throw new ApiError(409, 'Cannot reorder a smart playlist. It is managed by its tag.');
      }

      const existing = await db
        .select({ songId: playlistSongTable.songId })
        .from(playlistSongTable)
        .where(eq(playlistSongTable.playlistId, playlistId));

      const existingIds = new Set(existing.map((e) => e.songId));

      if (songIds.length !== existingIds.size) {
        throw new ApiError(
          400,
          `songIds count (${songIds.length}) does not match playlist song count (${existingIds.size}).`
        );
      }

      for (const si of songIds) {
        if (!existingIds.has(si)) {
          throw new ApiError(400, `Song ${si} is not in this playlist.`);
        }
      }

      await db.transaction(async (tx) => {
        await tx.delete(playlistSongTable).where(eq(playlistSongTable.playlistId, playlistId));

        const rows = songIds.map((sId, index) => ({
          playlistId,
          songId: sId,
          position: index,
        }));

        await tx.insert(playlistSongTable).values(rows);
      });

      const value = await getPlaylistSongCount(playlistId);
      emitPlaylistUpdated(formatPlaylist(playlist, value));

      return { message: 'Playlist reordered.' };
    },
    { body: PlaylistReorderSchema, response: { 200: MessageResponse } }
  )
  .delete(
    '/:id',
    async ({ user, params, set }) => {
      const id = params.id;
      const discordId = (user as { discordId: string }).discordId;
      await requirePlaylist(id, { discordId });

      await db.delete(playlistTable).where(eq(playlistTable.id, id));

      set.status = 204;
      return null;
    },
    { params: t.Object({ id: t.String() }), response: { 204: t.Void() } }
  );
