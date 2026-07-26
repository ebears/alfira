import { inArray } from 'drizzle-orm';

import { db, tables } from '../shared/db';

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
  if (rawTags.length === 0) {
    return [];
  }

  const trimmed = rawTags.map((t) => t.trim()).filter((t) => t.length > 0);
  if (trimmed.length === 0) {
    return [];
  }

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

  // Batch-check all tags in one query instead of N sequential lookups
  const nameLowers = [...seen.keys()];
  const existingRows = await db
    .select({ nameLower: tagTable.nameLower, canonicalName: tagTable.canonicalName })
    .from(tagTable)
    .where(inArray(tagTable.nameLower, nameLowers));

  const existingMap = new Map(existingRows.map((r) => [r.nameLower, r.canonicalName]));

  for (const [nameLower, originalSpelling] of seen) {
    const canonicalName = existingMap.get(nameLower);
    if (canonicalName !== undefined) {
      canonicalNames.push(canonicalName);
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
            id: crypto.randomUUID(),
            nameLower: spelling.toLowerCase(),
            canonicalName: spelling,
          })
          .execute();
      }
    });

    // Include the newly created tags in the return value
    canonicalNames.push(...missingTags);
  }

  return canonicalNames;
}
