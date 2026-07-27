import { eq, inArray, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { getGuildId } from '../lib/config';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { requireAdminOrPermission, requireAuth, type AuthContext } from '../lib/elysia-guards';
import { parsePagination } from '../lib/pagination';
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

const BulkDeleteSchema = t.Object({
  ids: t.Array(t.String(), { minLength: 1, maxLength: 5000 }),
});

const BulkTagSchema = t.Object({
  ids: t.Array(t.String(), { minLength: 1, maxLength: 5000 }),
  tags: t.Optional(t.Array(t.String())),
  mode: t.Optional(t.Union([t.Literal('add'), t.Literal('set')])),
});

const SongPatchSchema = t.Partial(
  t.Object({
    nickname: t.Unknown(),
    artist: t.Unknown(),
    album: t.Unknown(),
    artwork: t.Unknown(),
    tags: t.Unknown(),
    volumeBoost: t.Unknown(),
  })
);

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

async function deleteSongsByIds(ids: string[]) {
  await db.delete(songTable).where(inArray(songTable.id, ids));
  for (const id of ids) {
    emitSongDeleted(id);
  }
}

function fetchSongsByIds(ids: string[]) {
  return db.select().from(songTable).where(inArray(songTable.id, ids)).all();
}

function updateSongsByIds(ids: string[], data: Record<string, unknown>) {
  db.update(songTable).set(data).where(inArray(songTable.id, ids)).run();
}

function fetchSongById(id: string) {
  return db.select().from(songTable).where(eq(songTable.id, id)).limit(1).all()[0];
}

function deleteSongById(id: string) {
  db.delete(songTable).where(eq(songTable.id, id)).run();
}

async function updateSongReturning(id: string, data: Record<string, unknown>) {
  const [updated] = (await db
    .update(songTable)
    .set(data)
    .where(eq(songTable.id, id))
    .returning()) as unknown as [typeof songTable.$inferSelect | undefined];
  return updated;
}

// ---------------------------------------------------------------------------
// Shared helper — update the live GuildPlayer cache
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
// Plugin
// ---------------------------------------------------------------------------

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const songsPlugin = new Elysia({ prefix: '/songs' })
  .get('/', async (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const url = new URL((ctx.request as Request).url);
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

    // Build WHERE clause
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

    // Resolve Discord display names
    const nameMap = await resolveDisplayNames(songs as { addedBy: string }[]);

    const songsWithNames = songs.map((s) => ({
      ...formatSong(s),
      addedByDisplayName: nameMap.get(s.addedBy) ?? s.addedBy,
    }));

    return Response.json({
      items: songsWithNames,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
  .post(
    '/bulk-delete',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'songs.delete');
      if (guardErr) {
        return guardErr;
      }

      const { ids } = ctx.body as typeof BulkDeleteSchema.static;
      await deleteSongsByIds(ids);

      return Response.json({ deleted: ids.length });
    },
    { body: BulkDeleteSchema }
  )
  .post(
    '/bulk-tag',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'songs.edit');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as typeof BulkTagSchema.static;
      const { ids } = body;

      const tagsResult = validateTags(body.tags);
      if (!tagsResult.ok) {
        return tagsResult.response;
      }

      const newTags = await canonicalizeTags(tagsResult.value);
      const mode = body.mode ?? 'add';

      const existingSongs = fetchSongsByIds(ids);
      const updatedIds: string[] = [];

      if (mode === 'set') {
        updateSongsByIds(ids, { tags: newTags });
        updatedIds.push(...ids);
      } else {
        await Promise.all(
          existingSongs.map(async (song) => {
            const existingTags = song.tags ?? [];
            const merged = [...new Set([...existingTags, ...newTags])];
            await db.update(songTable).set({ tags: merged }).where(eq(songTable.id, song.id));
            updatedIds.push(song.id);
          })
        );
      }

      const updatedSongs = fetchSongsByIds(updatedIds);
      const bulkTagNameMap = await resolveDisplayNames(updatedSongs as { addedBy: string }[]);
      for (const s of updatedSongs) {
        emitSongUpdated({
          ...formatSong(s),
          addedByDisplayName: bulkTagNameMap.get(s.addedBy) ?? s.addedBy,
        });
      }

      if (newTags.length > 0) {
        await reSyncPlaylistsForTags(newTags.map((t) => t.toLowerCase()));
      }

      return Response.json({ updated: updatedSongs.length, tags: newTags });
    },
    { body: BulkTagSchema }
  )
  .post('/bulk-edit', async (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'songs.edit');
    if (guardErr) {
      return guardErr;
    }

    const body = ctx.body as Record<string, unknown>;
    const ids = body.ids as string[];
    const clearFields = (body.clearFields as string[]) ?? [];

    const fieldResult = await validateAndBuildSongFields(body, clearFields);
    if (fieldResult instanceof Response) {
      return fieldResult;
    }
    const { data, processedTags, processedVolumeBoost } = fieldResult;

    if (Object.keys(data).length === 0) {
      return Response.json({ error: 'No fields to update.' }, { status: 400 });
    }

    updateSongsByIds(ids, data);

    const updatedSongs = fetchSongsByIds(ids);
    const bulkEditNameMap = await resolveDisplayNames(updatedSongs as { addedBy: string }[]);
    for (const s of updatedSongs) {
      emitSongUpdated({
        ...formatSong(s),
        addedByDisplayName: bulkEditNameMap.get(s.addedBy) ?? s.addedBy,
      });
    }

    if (processedTags) {
      await reSyncPlaylistsForTags(processedTags.map((t) => t.toLowerCase()));
    }

    notifyPlayerOfMetadataChange(ids, data, processedVolumeBoost);

    return Response.json({ updated: ids.length });
  })
  .delete('/:id', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'songs.delete');
    if (guardErr) {
      return guardErr;
    }

    const id = (ctx.params as Record<string, string>).id as string;
    const existing = fetchSongById(id);
    if (!existing) {
      return Response.json({ error: 'Song not found.' }, { status: 404 });
    }

    deleteSongById(id);
    emitSongDeleted(id);

    return new Response(null, { status: 204 });
  })
  .patch(
    '/:id',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'songs.edit');
      if (guardErr) {
        return guardErr;
      }

      const id = (ctx.params as Record<string, string>).id as string;
      const body = ctx.body as typeof SongPatchSchema.static;

      const existing = fetchSongById(id);
      if (!existing) {
        return Response.json({ error: 'Song not found.' }, { status: 404 });
      }

      const oldTagsLower = new Set((existing.tags ?? []).map((t) => t.toLowerCase()));

      const fieldResult = await validateAndBuildSongFields(body);
      if (fieldResult instanceof Response) {
        return fieldResult;
      }
      const { data, processedTags, processedVolumeBoost } = fieldResult;

      const updatedSong = await updateSongReturning(id, data);
      if (!updatedSong) {
        return Response.json({ error: 'Failed to update song.' }, { status: 500 });
      }

      const patchedDisplayName = await getUserDisplayName(updatedSong.addedBy);
      emitSongUpdated({
        ...formatSong(updatedSong),
        addedByDisplayName: patchedDisplayName,
      });

      if (processedTags) {
        const newTagsLower = new Set(processedTags.map((t) => t.toLowerCase()));
        const affectedTags = [...new Set([...oldTagsLower, ...newTagsLower])];
        await reSyncPlaylistsForTags(affectedTags);
      }

      notifyPlayerOfMetadataChange([id], data, processedVolumeBoost);

      return Response.json(formatSong(updatedSong));
    },
    { body: SongPatchSchema }
  );
