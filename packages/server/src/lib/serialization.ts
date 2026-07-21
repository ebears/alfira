import { type Song } from '../shared';

// Accept both Date and string createdAt — Drizzle uses Date at the DB level,
// but we serialize to ISO string for JSON serialization.
export type SerializedSong = Omit<Song, 'createdAt'> & { createdAt: string | Date };

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

export function formatSong(s: {
  createdAt: Date | string;
  tags?: string[] | null;
}): SerializedSong {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    tags: s.tags ?? [],
  } as SerializedSong;
}
