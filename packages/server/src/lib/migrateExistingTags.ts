/**
 * One-time migration script to normalize existing tags on all songs.
 *
 * This establishes canonical spellings for all existing tags based on
 * first-seen spelling. Run once after the Tag table migration is applied.
 *
 * Usage: bun run packages/server/src/lib/migrateExistingTags.ts
 */

import { db, sql, tables } from '../shared/db';
import { logger } from '../shared/logger';
import { canonicalizeTags } from './tagCanonicalization';

const { song: songTable } = tables;

const normalizeTag = (t: string) => t.replace(/\s+/g, '-').trim();

/**
 * Normalizes existing tags on all songs. Creates Tag entries for any tags
 * that only exist in Song.tags JSON arrays but not in the Tag table.
 *
 * Safe to call multiple times — already-migrated songs are skipped.
 */
export async function runTagMigration(): Promise<{ normalized: number; errors: number }> {
  logger.info('Starting tag normalization migration');

  const songs = await db
    .select({ id: songTable.id, tags: songTable.tags })
    .from(songTable)
    .where(sql`${songTable.tags} IS NOT NULL AND ${songTable.tags} != '[]'`);

  logger.info({ count: songs.length }, 'Found songs with tags');

  let normalized = 0;
  let errors = 0;

  for (const song of songs) {
    if (!song.tags || !Array.isArray(song.tags) || song.tags.length === 0) {
      continue;
    }

    try {
      const canonicalTags = await canonicalizeTags(song.tags.map(normalizeTag));

      if (JSON.stringify(canonicalTags) !== JSON.stringify(song.tags)) {
        await db
          .update(songTable)
          .set({ tags: canonicalTags })
          .where(sql`id = ${song.id}`);
        normalized++;
      }
    } catch (err) {
      logger.error({ songId: song.id, err }, 'Error normalizing tags');
      errors++;
    }
  }

  logger.info({ normalized, errors }, 'Tag migration complete');
  return { normalized, errors };
}

// Standalone entry point — run with: bun run packages/server/src/lib/migrateExistingTags.ts
if (import.meta.filename.includes('migrateExistingTags')) {
  void (async () => {
    try {
      await runTagMigration();
    } catch (err) {
      logger.fatal(err, 'Tag migration failed');
      process.exit(1);
    }
  })();
}
