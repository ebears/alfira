import { randomUUID } from 'node:crypto';
import { db, eq, tables } from '../shared/db';

const { tag: tagTable } = tables;

/**
 * Canonicalizes a list of raw tags:
 * - Trims and filters empty tags
 * - Deduplicates case-insensitively (first-seen spelling wins)
 * - Looks up existing tags to get canonical spelling
 * - Creates new Tag entries for never-before-seen tags
 *
 * Example: ["Rock", "rock", "  ROCK  "] → ["Rock"]
 * Example: ["rock"] (first time) → ["rock"]
 */
export async function canonicalizeTags(rawTags: string[]): Promise<string[]> {
  if (rawTags.length === 0) return [];

  const trimmed = rawTags.map((t) => t.trim()).filter((t) => t.length > 0);
  if (trimmed.length === 0) return [];

  // Deduplicate case-insensitively, preserving first-seen spelling
  const seen = new Map<string, string>();
  for (const t of trimmed) {
    const lower = t.toLowerCase();
    if (!seen.has(lower)) {
      seen.set(lower, t);
    }
  }

  const canonicalNames: string[] = [];
  const missingTags: string[] = [];

  for (const [nameLower, originalSpelling] of seen) {
    const existing = await db
      .select({ canonicalName: tagTable.canonicalName })
      .from(tagTable)
      .where(eq(tagTable.nameLower, nameLower))
      .limit(1);

    if (existing.length > 0) {
      canonicalNames.push(existing[0]!.canonicalName);
    } else {
      missingTags.push(originalSpelling);
    }
  }

  if (missingTags.length > 0) {
    await db.transaction(async (tx) => {
      for (const spelling of missingTags) {
        await tx
          .insert(tagTable)
          .values({
            id: randomUUID(),
            nameLower: spelling.toLowerCase(),
            canonicalName: spelling,
          })
          .execute();
      }
    });
  }

  return canonicalNames;
}
