import { eq, inArray, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { authGuard, createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import { Song as SongSchema, TagItem } from '../lib/responseSchemas';
import { emitPlaylistUpdated } from '../lib/socket';
import { db, tables } from '../shared/db';

const { tag: tagTable, song: songTable, playlist: playlistTable } = tables;

const TAG_COLORS = ['orange', 'sky', 'emerald', 'amber', 'violet'] as const;

const TAG_COLOR_UNION = t.Union(TAG_COLORS.map((c) => t.Literal(c)));

const TagPatchSchema = t.Partial(
  t.Object({
    canonicalName: t.String({ minLength: 1 }),
    color: t.Nullable(TAG_COLOR_UNION),
  })
);

// ---------------------------------------------------------------------------
// Query helpers — extracted to avoid tsgo inference issues with Elysia handlers
// ---------------------------------------------------------------------------

function fetchTagList() {
  return db
    .select({
      nameLower: tagTable.nameLower,
      canonicalName: tagTable.canonicalName,
      color: tagTable.color,
    })
    .from(tagTable)
    .orderBy(tagTable.canonicalName)
    .all();
}

function fetchTag(nameLower: string) {
  return db.select().from(tagTable).where(eq(tagTable.nameLower, nameLower)).limit(1).all()[0];
}

function fetchSongsByTag(nameLower: string) {
  return db
    .select()
    .from(songTable)
    .where(sql`lower(${songTable.tags}) LIKE lower(${`%${nameLower}%`})`)
    .orderBy(songTable.title)
    .all();
}

async function updateTagReturning(nameLower: string, data: Record<string, unknown>) {
  const [updated] = await db
    .update(tagTable)
    .set(data)
    .where(eq(tagTable.nameLower, nameLower))
    .returning();
  return updated;
}

function fetchSongsWithTag(nameLower: string) {
  return db
    .select({ id: songTable.id, tags: songTable.tags })
    .from(songTable)
    .where(sql`lower(${songTable.tags}) LIKE lower(${`%${nameLower}%`})`)
    .all();
}

function removeTagFromSong(songId: string, tags: string[]) {
  return db.update(songTable).set({ tags }).where(eq(songTable.id, songId)).returning();
}

function fetchSmartPlaylistsByTag(nameLower: string) {
  return db.select().from(playlistTable).where(eq(playlistTable.tagNameLower, nameLower)).all();
}

function detachPlaylistTag(playlistId: string) {
  return db
    .update(playlistTable)
    .set({ tagNameLower: null })
    .where(eq(playlistTable.id, playlistId));
}

async function fetchPlaylistsByIds(ids: string[]) {
  // eslint-disable-next-line @typescript-eslint/return-await
  return await db.select().from(playlistTable).where(inArray(playlistTable.id, ids));
}

async function deleteTagRow(nameLower: string) {
  await db.delete(tagTable).where(eq(tagTable.nameLower, nameLower));
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const tagsPlugin = new Elysia({ prefix: '/tags' })
  .derive(deriveAuth)
  .use(authGuard)
  .get(
    '/',
    () => {
      return { tags: fetchTagList() };
    },
    { response: { 200: t.Object({ tags: t.Array(TagItem) }) } }
  )
  .get(
    '/:nameLower',
    ({ params }) => {
      const nameLower = (params as Record<string, string>).nameLower as string;
      const tag = fetchTag(nameLower);
      if (!tag) {
        throw new ApiError(404, 'Tag not found.');
      }

      return { tag };
    },
    { response: { 200: t.Object({ tag: TagItem }) } }
  )
  .get(
    '/:nameLower/songs',
    ({ params }) => {
      const nameLower = (params as Record<string, string>).nameLower as string;
      return { songs: fetchSongsByTag(nameLower) };
    },
    { response: { 200: t.Object({ songs: t.Array(SongSchema) }) } }
  )
  .use(createAdminOrPermissionGuard('tags.manage'))
  .patch(
    '/:nameLower',
    async ({ params, body }) => {
      const nameLower = (params as Record<string, string>).nameLower as string;

      const existing = fetchTag(nameLower);
      if (!existing) {
        throw new ApiError(404, 'Tag not found.');
      }

      const data: Record<string, unknown> = {};

      if (body.canonicalName !== undefined) {
        data.canonicalName = body.canonicalName.replace(/\s+/g, '-').trim();
      }

      if (body.color !== undefined) {
        data.color = body.color;
      }

      if (Object.keys(data).length === 0) {
        throw new ApiError(400, 'No valid fields to update.');
      }

      const updated = await updateTagReturning(nameLower, data);
      return { tag: updated };
    },
    { body: TagPatchSchema }
  )
  .delete('/:nameLower', async ({ params }) => {
    const nameLower = (params as Record<string, string>).nameLower as string;

    const existing = fetchTag(nameLower);
    if (!existing) {
      throw new ApiError(404, 'Tag not found.');
    }

    // Remove this tag from all songs that have it
    const songsWithTag = fetchSongsWithTag(nameLower);

    for (const song of songsWithTag) {
      const updatedTags = song.tags.filter((t) => t.toLowerCase() !== nameLower);
      removeTagFromSong(song.id, updatedTags);
    }

    // Convert any smart playlists tracking this tag to regular playlists
    const smartPlaylists = fetchSmartPlaylistsByTag(nameLower);

    await Promise.all(smartPlaylists.map((pl) => detachPlaylistTag(pl.id)));

    const updatedPlaylists = await fetchPlaylistsByIds(smartPlaylists.map((pl) => pl.id));

    for (const updatedPl of updatedPlaylists) {
      emitPlaylistUpdated({
        ...updatedPl,
      });
    }

    await deleteTagRow(nameLower);

    return { success: true };
  });
