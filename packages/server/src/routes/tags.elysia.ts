import { eq, inArray, sql } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { requireAdminOrPermission, requireAuth } from '../lib/elysia-guards';
import { emitPlaylistUpdated } from '../lib/socket';
import { db, tables } from '../shared/db';

const { tag: tagTable, song: songTable, playlist: playlistTable } = tables;

const TAG_COLORS = ['orange', 'sky', 'emerald', 'amber', 'violet'] as const;

const TagPatchSchema = v.partial(
  v.object({
    canonicalName: v.pipe(v.string(), v.minLength(1)),
    color: v.nullable(v.picklist(TAG_COLORS)),
  })
);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

async function deleteTag(nameLower: string) {
  await db.delete(tagTable).where(eq(tagTable.nameLower, nameLower));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleGetTagsList(ctx: Record<string, unknown>): Response {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  return json({ tags: fetchTagList() });
}

function handleGetTag(ctx: Record<string, unknown>): Response {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  const nameLower = (ctx.params as Record<string, string>).nameLower as string;
  const tag = fetchTag(nameLower);

  if (!tag) {
    return json({ error: 'Tag not found.' }, 404);
  }

  return json({ tag });
}

function handleGetTagSongs(ctx: Record<string, unknown>): Response {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  const nameLower = (ctx.params as Record<string, string>).nameLower as string;
  return json({ songs: fetchSongsByTag(nameLower) });
}

async function handlePatchTag(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'tags.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const nameLower = (ctx.params as Record<string, string>).nameLower as string;
  const bodyData = ctx.body as v.InferOutput<typeof TagPatchSchema>;

  const existing = fetchTag(nameLower);
  if (!existing) {
    return json({ error: 'Tag not found.' }, 404);
  }

  const data: Record<string, unknown> = {};

  if (bodyData.canonicalName !== undefined) {
    data.canonicalName = bodyData.canonicalName.replace(/\s+/g, '-').trim();
  }

  if (bodyData.color !== undefined) {
    data.color = bodyData.color;
  }

  if (Object.keys(data).length === 0) {
    return json({ error: 'No valid fields to update.' }, 400);
  }

  const updated = await updateTagReturning(nameLower, data);
  return json({ tag: updated });
}

async function handleDeleteTag(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'tags.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const nameLower = (ctx.params as Record<string, string>).nameLower as string;

  const existing = fetchTag(nameLower);
  if (!existing) {
    return json({ error: 'Tag not found.' }, 404);
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
      createdAt: updatedPl.createdAt.toISOString(),
    });
  }

  await deleteTag(nameLower);

  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
export function tagsPlugin(app: Elysia): Elysia {
  return app
    .get('/tags', handleGetTagsList as never)
    .get('/tags/:nameLower', handleGetTag as never)
    .get('/tags/:nameLower/songs', handleGetTagSongs as never)
    .patch('/tags/:nameLower', handlePatchTag as never, { body: TagPatchSchema })
    .delete('/tags/:nameLower', handleDeleteTag as never) as unknown as Elysia;
}
