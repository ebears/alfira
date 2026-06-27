import { db, sql, tables } from '../shared/db';
import { runTagMigration } from './migrateExistingTags';

const { tag: tagTable, song: songTable } = tables;

/**
 * Ensures that tags from existing songs are migrated to the Tag table.
 * If the Tag table is empty and songs have JSON tags, runs the migration.
 *
 * Called automatically on startup after DB migrations.
 */
export async function ensureTagsMigrated(): Promise<void> {
  const [tagCount] = await db.select({ count: sql<number>`count(*)` }).from(tagTable).limit(1);

  if (!tagCount || tagCount.count > 0) {
    return; // Tags already exist, nothing to do
  }

  const [songCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(songTable)
    .where(sql`${songTable.tags} IS NOT NULL AND ${songTable.tags} != '[]'`)
    .limit(1);

  if (!songCount || songCount.count === 0) {
    return; // No songs have tags, nothing to do
  }

  // Tag table is empty but songs have tags — run the migration
  const { normalized, errors } = await runTagMigration();
  if (errors > 0) {
    throw new Error(`Tag migration failed with ${errors} errors`);
  }
  console.log(`[ensureTagsMigrated] Migrated tags from ${normalized} songs`);
}
