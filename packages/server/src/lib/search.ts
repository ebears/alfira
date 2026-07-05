import { sql } from 'drizzle-orm';
import { $client } from '../shared/db';

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
  if (!search) return undefined;

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
