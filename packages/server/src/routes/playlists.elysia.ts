import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { elysiaJson as json } from '../lib/apiResponse';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { requireAuth, type AuthContext } from '../lib/elysia-guards';
import { parsePagination } from '../lib/pagination';
import { canAccessPlaylist, getPlaylistSongCount, requirePlaylist } from '../lib/playlistAccess';
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
// Schemas
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
// Plugin
// ---------------------------------------------------------------------------

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const playlistsPlugin = new Elysia({ prefix: '/playlists' })
  .get('/', (async (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const url = new URL((ctx.request as Request).url);
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

    return json({
      items: playlistsWithCreator,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  }) as never)
  .post(
    '/',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const body = ctx.body as v.InferOutput<typeof PlaylistCreateSchema>;

      const nameResult = validatePlaylistName(body.name);
      if (!nameResult.ok) {
        return nameResult.response;
      }
      const trimmedName = nameResult.value;

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
        return json({ error: 'Failed to create playlist.' }, 500);
      }

      if (tagNameLower) {
        await syncPlaylistToTag(playlist.id);
      }

      const songCount = await getPlaylistSongCount(playlist.id);
      emitPlaylistUpdated(formatPlaylist(playlist, songCount));
      return json(playlist, 201);
    }) as never,
    { body: PlaylistCreateSchema }
  )
  .post(
    '/:id/songs/bulk-remove',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const playlistId = (ctx.params as Record<string, string>).id as string;
      const { songIds } = ctx.body as v.InferOutput<typeof PlaylistRemoveSongsSchema>;

      const discordId = (user as { discordId: string }).discordId;
      const playlist = await requirePlaylist(playlistId, { discordId });
      if (playlist instanceof Response) {
        return playlist;
      }

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

      return json({ removed: songIds.length });
    }) as never,
    { body: PlaylistRemoveSongsSchema }
  )
  .delete('/:id/songs/:songId', (async (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const playlistId = (ctx.params as Record<string, string>).id as string;
    const songId = (ctx.params as Record<string, string>).songId as string;

    const discordId = (user as { discordId: string }).discordId;
    const playlist = await requirePlaylist(playlistId, { discordId });
    if (playlist instanceof Response) {
      return playlist;
    }

    const [entry] = await db
      .select()
      .from(playlistSongTable)
      .where(
        and(eq(playlistSongTable.playlistId, playlistId), eq(playlistSongTable.songId, songId))
      )
      .limit(1);

    if (!entry) {
      return json({ error: 'Song not found in playlist.' }, 404);
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

    return new Response(null, { status: 204 });
  }) as never)
  .post(
    '/:id/songs',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const id = (ctx.params as Record<string, string>).id as string;
      const { songId } = ctx.body as v.InferOutput<typeof PlaylistAddSongSchema>;

      const discordId = (user as { discordId: string }).discordId;
      const playlist = await requirePlaylist(id, { discordId });
      if (playlist instanceof Response) {
        return playlist;
      }

      if (playlist.tagNameLower) {
        return json(
          {
            error: `This playlist automatically tracks the "${playlist.tagNameLower}" tag. Songs are added when tagged and cannot be added manually.`,
          },
          409
        );
      }

      const [song] = (await db
        .select()
        .from(tables.song)
        .where(eq(tables.song.id, songId))
        .limit(1)) as unknown as [typeof tables.song.$inferSelect | undefined];
      if (!song) {
        return json({ error: 'Song not found.' }, 404);
      }

      const [existingEntry] = await db
        .select()
        .from(playlistSongTable)
        .where(
          and(eq(playlistSongTable.playlistId, playlist.id), eq(playlistSongTable.songId, song.id))
        )
        .limit(1);

      if (existingEntry) {
        return json({ error: 'This song is already in the playlist.' }, 409);
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

      const songData = { ...song, createdAt: song.createdAt.toISOString(), tags: song.tags ?? [] };
      const value = await getPlaylistSongCount(playlist.id);
      emitPlaylistUpdated(formatPlaylist(playlist, value));

      return json({ ...ps, song: songData }, 201);
    }) as never,
    { body: PlaylistAddSongSchema }
  )
  .patch(
    '/:id/visibility',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const id = (ctx.params as Record<string, string>).id as string;
      const body = ctx.body as v.InferOutput<typeof PlaylistVisibilitySchema>;

      if (body.isPrivate === undefined) {
        return json({ error: 'isPrivate (boolean) is required.' }, 400);
      }

      const discordId = (user as { discordId: string }).discordId;
      const adminView = body.adminView === true;
      const existing = await requirePlaylist(id, { discordId }, adminView);
      if (existing instanceof Response) {
        return existing;
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
    }) as never,
    { body: PlaylistVisibilitySchema }
  )
  .get('/:id', (async (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const id = (ctx.params as Record<string, string>).id as string;
    const url = new URL((ctx.request as Request).url);
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
    if (playlist instanceof Response) {
      return playlist;
    }

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

      return json({
        ...playlist,
        createdAt:
          playlist.createdAt instanceof Date
            ? playlist.createdAt.toISOString()
            : playlist.createdAt,
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
  }) as never)
  .patch(
    '/:id',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const id = (ctx.params as Record<string, string>).id as string;
      const body = ctx.body as v.InferOutput<typeof PlaylistCreateSchema>;

      const discordId = (user as { discordId: string }).discordId;
      const existing = await requirePlaylist(id, { discordId });
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

      if ('tagNameLower' in data) {
        await syncPlaylistToTag(updatedPlaylist.id);
      }

      const value = await getPlaylistSongCount(updatedPlaylist.id);
      emitPlaylistUpdated(formatPlaylist(updatedPlaylist, value));
      return json(updatedPlaylist);
    }) as never,
    { body: PlaylistCreateSchema }
  )
  .patch(
    '/:id/reorder',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const playlistId = (ctx.params as Record<string, string>).id as string;
      const { songIds } = ctx.body as v.InferOutput<typeof PlaylistReorderSchema>;

      const discordId = (user as { discordId: string }).discordId;
      const playlist = await requirePlaylist(playlistId, { discordId });
      if (playlist instanceof Response) {
        return playlist;
      }

      if (playlist.tagNameLower) {
        return json({ error: 'Cannot reorder a smart playlist. It is managed by its tag.' }, 409);
      }

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

      for (const si of songIds) {
        if (!existingIds.has(si)) {
          return json({ error: `Song ${si} is not in this playlist.` }, 400);
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

      return json({ message: 'Playlist reordered.' });
    }) as never,
    { body: PlaylistReorderSchema }
  )
  .delete('/:id', (async (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const id = (ctx.params as Record<string, string>).id as string;
    const discordId = (user as { discordId: string }).discordId;
    const existing = await requirePlaylist(id, { discordId });
    if (existing instanceof Response) {
      return existing;
    }

    await db.delete(playlistTable).where(eq(playlistTable.id, id));

    return new Response(null, { status: 204 });
  }) as never);
