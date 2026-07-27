import { type Song } from '../shared';

// Drizzle's isoTimestamp custom type returns ISO strings directly — no Date
// conversion needed. SerializedSong is now the same as Song.
export type SerializedSong = Song;

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/** Normalize a Drizzle song row for JSON serialization (tags: null → []). */
export function formatSong(s: { createdAt: string; tags?: string[] | null }): Song {
  // The spread + override pattern narrows null tags, but TypeScript can't verify
  // the result satisfies all Song properties. The cast is safe — Drizzle rows
  // always include all Song columns.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...s,
    tags: s.tags ?? [],
  } as Song;
}
