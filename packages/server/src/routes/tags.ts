import { eq, sql } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { requireAdmin, requireAuth } from '../lib/guards';
import { json } from '../lib/json';
import { db, tables } from '../shared/db';

const { tag: tagTable, song: songTable } = tables;

const TAG_COLORS = ['orange', 'sky', 'emerald', 'amber', 'violet'] as const;
type TagColor = (typeof TAG_COLORS)[number];

async function handleGetTagSongs(ctx: RouteContext, nameLower: string): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;

  // Fetch all songs where tags JSON array contains this tag (case-insensitive match)
  const songs = await db
    .select()
    .from(songTable)
    .where(sql`lower(${songTable.tags}) LIKE lower(${`%${nameLower}%`})`)
    .orderBy(songTable.title)
    .all();

  return json({ songs });
}

async function handlePatchTag(
  ctx: RouteContext,
  nameLower: string,
  body: Record<string, unknown>
): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

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

async function handleDeleteTag(ctx: RouteContext, nameLower: string): Promise<Response> {
  const userOrErr = requireAuth(ctx);
  if (userOrErr instanceof Response) return userOrErr;
  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

  const [existing] = await db
    .select()
    .from(tagTable)
    .where(eq(tagTable.nameLower, nameLower))
    .limit(1);
  if (!existing) {
    return json({ error: 'Tag not found.' }, 404);
  }

  // Remove this tag from all songs that have it
  const songsWithTag = await db
    .select({ id: songTable.id, tags: songTable.tags })
    .from(songTable)
    .where(sql`lower(${songTable.tags}) LIKE lower(${`%${nameLower}%`})`)
    .all();

  for (const song of songsWithTag) {
    if (song.tags && Array.isArray(song.tags)) {
      const updatedTags = song.tags.filter((t) => t.toLowerCase() !== nameLower);
      await db
        .update(songTable)
        .set({ tags: updatedTags })
        .where(eq(songTable.id, song.id))
        .returning();
    }
  }

  await db.delete(tagTable).where(eq(tagTable.nameLower, nameLower));

  return json({ success: true });
}

export async function handleTags(ctx: RouteContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // GET /api/tags
  if (request.method === 'GET' && pathname === '/api/tags') {
    const userOrErr = requireAuth(ctx);
    if (userOrErr instanceof Response) return userOrErr;

    const tags = await db
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

  // GET /api/tags/:nameLower/songs — get all songs with this tag
  if (request.method === 'GET' && pathname.match(/^\/api\/tags\/([^/]+)\/songs$/)) {
    const match = pathname.match(/^\/api\/tags\/([^/]+)\/songs$/);
    const nameLower = match?.[1];
    if (!nameLower) return json({ error: 'Not Found' }, 404);
    return handleGetTagSongs(ctx, nameLower);
  }

  // GET /api/tags/:nameLower — get single tag
  if (request.method === 'GET' && pathname.startsWith('/api/tags/')) {
    const nameLower = pathname.slice('/api/tags/'.length);
    const userOrErr = requireAuth(ctx);
    if (userOrErr instanceof Response) return userOrErr;
    const [tag] = await db
      .select()
      .from(tagTable)
      .where(eq(tagTable.nameLower, nameLower))
      .limit(1);
    if (!tag) return json({ error: 'Tag not found.' }, 404);
    return json({ tag });
  }

  // PATCH /api/tags/:nameLower
  if (request.method === 'PATCH' && pathname.startsWith('/api/tags/')) {
    const nameLower = pathname.slice('/api/tags/'.length);
    if (nameLower.includes('/')) {
      return json({ error: 'Not Found' }, 404);
    }
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400);
    }
    return handlePatchTag(ctx, nameLower, body);
  }

  // DELETE /api/tags/:nameLower
  if (request.method === 'DELETE' && pathname.startsWith('/api/tags/')) {
    const nameLower = pathname.slice('/api/tags/'.length);
    if (nameLower.includes('/')) {
      return json({ error: 'Not Found' }, 404);
    }
    return handleDeleteTag(ctx, nameLower);
  }

  return json({ error: 'Not Found' }, 404);
}
