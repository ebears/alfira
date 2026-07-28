import { eq, inArray, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { getGuildId } from '../lib/config';
import { getUserDisplayName, resolveDisplayNames } from '../lib/displayName';
import { authPlugin } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import { PaginatedResult, type PaginationMeta, Song } from '../lib/responseSchemas';
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
    nickname: t.Nullable(t.String()),
    artist: t.Nullable(t.String()),
    album: t.Nullable(t.String()),
    artwork: t.Nullable(t.String()),
    tags: t.Array(t.String()),
    volumeBoost: t.Nullable(t.Integer({ minimum: -100, maximum: 200 })),
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
// Route handler (extracted to avoid Elysia NoInfer type limitation)
// ---------------------------------------------------------------------------

async function handleGetSongs(q: Record<string, string>) {
  const rawPage = Math.trunc(Number(q.page ?? '1')) || 1;
  const page = Math.max(1, rawPage);
  const rawLimit = Math.trunc(Number(q.limit ?? '30')) || 30;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  const search = (q.search ?? '').trim();

  // Sort
  const sortRaw = q.sort ?? 'createdAt';
  const sortField = parseSongSortField(sortRaw) ?? 'createdAt';
  const sortOrder = q.order === 'asc' ? 'ASC' : 'DESC';

  // Filters
  const tagsParam = (q.tags ?? '').trim();
  const sourcesParam = (q.source ?? '').trim();
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

  return {
    items: songsWithNames,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const songsPlugin = new Elysia({ prefix: '/songs', name: 'songs' })
  .use(authPlugin)

  .get(
    '/',
    ({ request }) => {
      const q: Record<string, string> = {};
      const sp = new URL(request.url).searchParams;
      for (const [k, v] of sp) {
        q[k] = v;
      }
      return handleGetSongs(q) as unknown as {
        items: (typeof Song.static)[];
        pagination: typeof PaginationMeta.static;
      };
    },
    {
      isAuth: true,
      response: {
        200: PaginatedResult(Song),
      },
    }
  )
  .post(
    '/bulk-delete',
    async ({ body }) => {
      const { ids } = body;
      await deleteSongsByIds(ids);

      return { deleted: ids.length };
    },
    {
      hasPermission: 'songs.delete',
      body: BulkDeleteSchema,
      response: { 200: t.Object({ deleted: t.Number() }) },
    }
  )
  .delete(
    '/:id',
    ({ params, set }) => {
      const id = params.id;
      const existing = fetchSongById(id);
      if (!existing) {
        throw new ApiError(404, 'Song not found.');
      }

      deleteSongById(id);
      emitSongDeleted(id);

      set.status = 204;
      return null;
    },
    {
      hasPermission: 'songs.delete',
      params: t.Object({ id: t.String() }),
      response: { 204: t.Void() },
    }
  )

  .post(
    '/bulk-tag',
    async ({ body }) => {
      const { ids } = body;

      const newTags = await canonicalizeTags(validateTags(body.tags));
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

      return { updated: updatedSongs.length, tags: newTags };
    },
    {
      hasPermission: 'songs.edit',
      body: BulkTagSchema,
      response: { 200: t.Object({ updated: t.Number(), tags: t.Array(t.String()) }) },
    }
  )
  .post(
    '/bulk-edit',
    async ({ body }) => {
      const b = body as Record<string, unknown>;
      const ids = b.ids as string[];
      const clearFields = (b.clearFields as string[]) ?? [];

      const { data, processedTags, processedVolumeBoost } = await validateAndBuildSongFields(
        b,
        clearFields
      );

      if (Object.keys(data).length === 0) {
        throw new ApiError(400, 'No fields to update.');
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

      return { updated: ids.length };
    },
    { hasPermission: 'songs.edit', response: { 200: t.Object({ updated: t.Number() }) } }
  )
  .patch(
    '/:id',
    async ({ params, body }): Promise<typeof Song.static> => {
      const id = params.id;

      const existing = fetchSongById(id);
      if (!existing) {
        throw new ApiError(404, 'Song not found.');
      }

      const oldTagsLower = new Set((existing.tags ?? []).map((t) => t.toLowerCase()));

      const { data, processedTags, processedVolumeBoost } = await validateAndBuildSongFields(body);

      const updatedSong = await updateSongReturning(id, data);
      if (!updatedSong) {
        throw new ApiError(500, 'Failed to update song.');
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

      return formatSong(updatedSong) as unknown as typeof Song.static;
    },
    {
      hasPermission: 'songs.edit',
      params: t.Object({ id: t.String() }),
      body: SongPatchSchema,
      response: { 200: Song },
    }
  );
