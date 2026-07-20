import { sql } from 'drizzle-orm';

import { $client } from '../shared/db';

// ---------------------------------------------------------------------------
// Song sort fields — shared between songs and playlist detail endpoints.
// ---------------------------------------------------------------------------
export const SONG_SORT_FIELDS = ['createdAt', 'title', 'artist', 'album', 'duration'] as const;
export type SongSortField = (typeof SONG_SORT_FIELDS)[number];

/** Parse a raw sort query param into a SongSortField, or null if unrecognized. */
export function parseSongSortField(raw: string): SongSortField | null {
  return (SONG_SORT_FIELDS as readonly string[]).includes(raw) ? (raw as SongSortField) : null;
}

/**
 * Build a dynamic ORDER BY clause for song queries.
 *
 * Pass column references via the optional `cols` parameter when the query
 * involves a join (e.g. playlistSong ↔ song).  Omit for single-table queries.
 *
 * Column params accept Drizzle column refs (SQLiteColumn / PgColumn) or
 * raw SQL chunks — anything the `sql` tagged template can interpolate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle column refs are not assignable to SQL<unknown> but are valid sql`` interpolations
type SqlInterpolatable = any;

export function buildSongOrderBy(
  sortField: SongSortField,
  sortOrder: 'ASC' | 'DESC',
  cols?: {
    title: SqlInterpolatable;
    nickname: SqlInterpolatable;
    artist: SqlInterpolatable;
    album: SqlInterpolatable;
    duration: SqlInterpolatable;
    createdAt: SqlInterpolatable;
  }
): ReturnType<typeof sql> {
  const c = cols ?? {
    title: sql`title`,
    nickname: sql`nickname`,
    artist: sql`artist`,
    album: sql`album`,
    duration: sql`duration`,
    createdAt: sql`"createdAt"`,
  };
  switch (sortField) {
    case 'title':
      return sql`lower(COALESCE(NULLIF(TRIM(${c.nickname}), ''), ${c.title})) ${sql.raw(sortOrder)}`;
    case 'artist':
      return sql`${c.artist} IS NULL, lower(${c.artist}) ${sql.raw(sortOrder)}`;
    case 'album':
      return sql`${c.album} IS NULL, lower(${c.album}) ${sql.raw(sortOrder)}`;
    case 'duration':
      return sql`${c.duration} ${sql.raw(sortOrder)}`;
    case 'createdAt':
      return sql`${c.createdAt} ${sql.raw(sortOrder)}`;
  }
}

/**
 * Build WHERE filter clauses for tag AND source OR matching.
 * Returns undefined when no filters are active.
 *
 * Pass column references via the optional `cols` parameter when the query
 * involves a join (e.g. playlistSong ↔ song).  Omit for single-table queries.
 *
 * Column params accept Drizzle column refs (SQLiteColumn / PgColumn) or
 * raw SQL chunks — anything the `sql` tagged template can interpolate.
 */
export function buildSongFilterClause(
  tags: string[],
  sources: string[],
  cols?: {
    tags: SqlInterpolatable;
    sourceUrl: SqlInterpolatable;
  }
): ReturnType<typeof sql> | undefined {
  const c = cols ?? { tags: sql`tags`, sourceUrl: sql`"sourceUrl"` };
  const clauses: ReturnType<typeof sql>[] = [];

  // Tags: AND — song must have every requested tag.
  // Match JSON-quoted tag name for precision (avoids partial matches like
  // "rock" matching "bedrock").
  for (const tag of tags) {
    clauses.push(sql`lower(${c.tags}) LIKE lower(${`%"${tag}"%`})`);
  }

  // Sources: OR — song URL can match any of the requested sources.
  if (sources.length > 0) {
    const sourceOrs: ReturnType<typeof sql>[] = [];
    for (const source of sources) {
      const patterns = SOURCE_LIKE_PATTERNS[source];
      if (patterns) {
        for (const pattern of patterns) {
          sourceOrs.push(sql`${c.sourceUrl} LIKE ${pattern}`);
        }
      }
    }
    if (sourceOrs.length > 0) {
      clauses.push(sql`(${sql.join(sourceOrs, sql` OR `)})`);
    }
  }

  if (clauses.length === 0) {
    return undefined;
  }
  return sql.join(clauses, sql` AND `);
}

// ---------------------------------------------------------------------------
// Source URL → LIKE patterns for server-side source filtering.
// Must mirror the web's HOST_TO_SOURCE map in packages/web/src/utils/source.ts.
// ---------------------------------------------------------------------------
export const SOURCE_LIKE_PATTERNS: Record<string, string[]> = {
  youtube: ['%youtube.com%', '%youtu.be%'],
  soundcloud: ['%soundcloud.com%'],
  spotify: ['%spotify.com%'],
  applemusic: ['%music.apple.com%'],
  tidal: ['%tidal.com%'],
  googledrive: ['%drive.google.com%'],
};

export function buildSongSearchClause(
  search: string | undefined
): ReturnType<typeof sql> | undefined {
  if (!search) {
    return undefined;
  }

  const tagMatchingIds = (
    $client.query(`SELECT id FROM "Song" WHERE lower(tags) LIKE lower(?)`).all(`%${search}%`) as {
      id: string;
    }[]
  ).map((r) => r.id);

  const base = sql`(lower(title) LIKE lower(${`%${search}%`}) OR lower(nickname) LIKE lower(${`%${search}%`}) OR lower(artist) LIKE lower(${`%${search}%`}) OR lower(album) LIKE lower(${`%${search}%`}))`;

  if (tagMatchingIds.length > 0) {
    return sql`(${base} OR id IN (${sql.join(
      tagMatchingIds.map((id) => sql.raw(`'${id}'`)),
      sql`,`
    )}))`;
  }

  return sql`(${base})`;
}
