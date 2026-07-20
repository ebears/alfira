import { eq, sql } from 'drizzle-orm';
import type { RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { emitPlaylistUpdated } from '../lib/socket';
import { db, tables } from '../shared/db';

const { tag: tagTable, song: songTable, playlist: playlistTable } = tables;

const TAG_COLORS = ['orange', 'sky', 'emerald', 'amber', 'violet'] as const;
type TagColor = (typeof TAG_COLORS)[number];

// ---------------------------------------------------------------------------
// GET /api/tags — list all tags
// ---------------------------------------------------------------------------
function handleGetTagsList(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Response {
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }

  const tags = db
    .select({
      nameLower: tagTable.nameLower,
      canonicalName: tagTable.canonicalName,
      color: tagTable.color,
    })
    .from(tagTable)
    .orderBy(tagTable.canonicalName)
    .all();

  return json({ tags });
}

// ---------------------------------------------------------------------------
// GET /api/tags/:nameLower — get single tag
// ---------------------------------------------------------------------------
async function handleGetTag(
  ctx: RouteContext,
  _request: Request,
  params: Record<string, string>
): Promise<Response> {
  const { nameLower } = params;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }
  const [tag] = await db.select().from(tagTable).where(eq(tagTable.nameLower, nameLower)).limit(1);
  if (!tag) {
    return json({ error: 'Tag not found.' }, 404);
  }
  return json({ tag });
}

function handleGetTagSongs(
  ctx: RouteContext,
  _request: Request,
  params: Record<string, string>
): Response {
  const { nameLower } = params;
  const guards = checkGuards(ctx);
  if (guards instanceof Response) {
    return guards;
  }

  // Fetch all songs where tags JSON array contains this tag (case-insensitive match)
  const songs = db
    .select()
    .from(songTable)
    .where(sql`lower(${songTable.tags}) LIKE lower(${`%${nameLower}%`})`)
    .orderBy(songTable.title)
    .all();

  return json({ songs });
}

async function handlePatchTag(
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
): Promise<Response> {
  const { nameLower } = params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const guards = checkGuards(ctx, { admin: true, permission: 'tags.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  const [existing] = await db
    .select()
    .from(tagTable)
    .where(eq(tagTable.nameLower, nameLower))
    .limit(1);
  if (!existing) {
    return json({ error: 'Tag not found.' }, 404);
  }

  const data: Record<string, unknown> = {};

  if ('canonicalName' in body) {
    if (typeof body.canonicalName !== 'string' || body.canonicalName.trim().length === 0) {
      return json({ error: 'canonicalName must be a non-empty string.' }, 400);
    }
    data.canonicalName = body.canonicalName.replace(/\s+/g, '-').trim();
  }

  if ('color' in body) {
    if (body.color !== null && typeof body.color !== 'string') {
      return json({ error: 'color must be a string or null.' }, 400);
    }
    if (body.color !== null && !TAG_COLORS.includes(body.color as TagColor)) {
      return json({ error: `color must be one of: ${TAG_COLORS.join(', ')}.` }, 400);
    }
    data.color = body.color;
  }

  if (Object.keys(data).length === 0) {
    return json({ error: 'No valid fields to update.' }, 400);
  }

  const [updated] = await db
    .update(tagTable)
    .set(data)
    .where(eq(tagTable.nameLower, nameLower))
    .returning();

  return json({ tag: updated });
}

async function handleDeleteTag(
  ctx: RouteContext,
  _request: Request,
  params: Record<string, string>
): Promise<Response> {
  const { nameLower } = params;
  const guards = checkGuards(ctx, { admin: true, permission: 'tags.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  const [existing] = await db
    .select()
    .from(tagTable)
    .where(eq(tagTable.nameLower, nameLower))
    .limit(1);
  if (!existing) {
    return json({ error: 'Tag not found.' }, 404);
  }

  // Remove this tag from all songs that have it
  const songsWithTag = db
    .select({ id: songTable.id, tags: songTable.tags })
    .from(songTable)
    .where(sql`lower(${songTable.tags}) LIKE lower(${`%${nameLower}%`})`)
    .all();

  for (const song of songsWithTag) {
    if (song.tags && Array.isArray(song.tags)) {
      const updatedTags = song.tags.filter((t) => t.toLowerCase() !== nameLower);
      db.update(songTable).set({ tags: updatedTags }).where(eq(songTable.id, song.id)).returning();
    }
  }

  // Convert any smart playlists tracking this tag to regular playlists
  const smartPlaylists = db
    .select()
    .from(playlistTable)
    .where(eq(playlistTable.tagNameLower, nameLower))
    .all();

  for (const pl of smartPlaylists) {
    await db.update(playlistTable).set({ tagNameLower: null }).where(eq(playlistTable.id, pl.id));

    // Emit update for each affected playlist
    const [updatedPl] = await db
      .select()
      .from(playlistTable)
      .where(eq(playlistTable.id, pl.id))
      .limit(1);
    if (updatedPl) {
      emitPlaylistUpdated({
        ...updatedPl,
        createdAt: updatedPl.createdAt.toISOString(),
      });
    }
  }

  await db.delete(tagTable).where(eq(tagTable.nameLower, nameLower));

  return json({ success: true });
}

export const handleTags = routeTable('/api/tags', {
  routes: [
    ['GET', '/', handleGetTagsList],
    ['GET', '/:nameLower/songs', handleGetTagSongs],
    ['GET', '/:nameLower', handleGetTag],
    ['PATCH', '/:nameLower', handlePatchTag],
    ['DELETE', '/:nameLower', handleDeleteTag],
  ],
});
