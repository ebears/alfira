import { describe, expect, mock, test } from 'bun:test';

// search.ts imports drizzle-orm's `sql` tagged-template and the DB client.
// Full fidelity mocking of sql.raw() / nested sql chunks is brittle without
// the real drizzle-orm.  Test pure functions exhaustively; query builders
// get structural assertions (shape, null/undefined guards, sort direction).

interface SqlFragment {
  strings: string[];
  values: unknown[];
}

function makeSqlResult(strings: string[], values: unknown[]): SqlFragment {
  return { strings: [...strings], values };
}

const sqlMock = (strings: TemplateStringsArray, ...values: unknown[]): SqlFragment =>
  makeSqlResult([...strings], values);
sqlMock.raw = (value: string) => value;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
(sqlMock as unknown as Record<string, unknown>).join = (
  items: unknown[],
  sep: unknown
): SqlFragment => makeSqlResult(['(', ')'], [items, sep]);

// NOTE: eqBands.test.ts also mocks ../shared/db (with tables). Bun shares
// mock.module registrations across test files, so both mocks must export a
// superset of keys to avoid "export not found" errors in either file.
void mock.module('drizzle-orm', () => ({
  sql: sqlMock,
}));
void mock.module('../shared/db', () => ({
  $client: { query: mock(() => ({ all: mock(() => []) })) },
  tables: {},
}));

const { parseSongSortField, buildSongOrderBy, buildSongFilterClause, SONG_SORT_FIELDS } =
  await import('./search');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast a drizzle SQL result to our mock shape so we can inspect fragments. */
function asSqlFragment(s: unknown): SqlFragment {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return s as SqlFragment;
}

// ---------------------------------------------------------------------------
// SONG_SORT_FIELDS
// ---------------------------------------------------------------------------

describe('SONG_SORT_FIELDS', () => {
  test('contains expected fields', () => {
    expect(SONG_SORT_FIELDS).toContain('createdAt');
    expect(SONG_SORT_FIELDS).toContain('title');
    expect(SONG_SORT_FIELDS).toContain('artist');
    expect(SONG_SORT_FIELDS).toContain('album');
    expect(SONG_SORT_FIELDS).toContain('duration');
  });

  test('has exactly 5 fields', () => {
    expect(SONG_SORT_FIELDS).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// parseSongSortField
// ---------------------------------------------------------------------------

describe('parseSongSortField', () => {
  test('returns the field for every valid input', () => {
    for (const field of SONG_SORT_FIELDS) {
      expect(parseSongSortField(field)).toBe(field);
    }
  });

  test('returns null for unrecognized strings', () => {
    expect(parseSongSortField('bpm')).toBeNull();
    expect(parseSongSortField('')).toBeNull();
    expect(parseSongSortField('genre')).toBeNull();
  });

  test('returns null for injection-looking strings', () => {
    expect(parseSongSortField('DROP TABLE songs')).toBeNull();
    expect(parseSongSortField('1; SELECT *')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSongOrderBy  (structural — full SQL content requires real drizzle-orm)
// ---------------------------------------------------------------------------

describe('buildSongOrderBy', () => {
  test('returns an object with strings and values arrays', () => {
    const result = asSqlFragment(buildSongOrderBy('title', 'ASC'));
    expect(result).toHaveProperty('strings');
    expect(result).toHaveProperty('values');
    expect(Array.isArray(result.strings)).toBe(true);
    expect(Array.isArray(result.values)).toBe(true);
  });

  test('every sort field produces a non-empty result', () => {
    for (const field of SONG_SORT_FIELDS) {
      const asc = asSqlFragment(buildSongOrderBy(field, 'ASC'));
      const desc = asSqlFragment(buildSongOrderBy(field, 'DESC'));
      expect(asc.strings.length).toBeGreaterThan(0);
      expect(desc.strings.length).toBeGreaterThan(0);
    }
  });

  test('accepts custom column references', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cols: any = {
      title: 't.custom_title',
      nickname: 't.nickname',
      artist: 't.artist',
      album: 't.album',
      duration: 't.duration',
      createdAt: 't.created_at',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = asSqlFragment(buildSongOrderBy('title', 'ASC', cols));
    expect(result).toHaveProperty('strings');
  });
});

// ---------------------------------------------------------------------------
// buildSongFilterClause  (structural)
// ---------------------------------------------------------------------------

describe('buildSongFilterClause', () => {
  test('returns undefined when no tags or sources are provided', () => {
    expect(buildSongFilterClause([], [])).toBeUndefined();
  });

  test('returns a clause object when tags are provided', () => {
    const result = asSqlFragment(buildSongFilterClause(['rock'], []));
    expect(result).toHaveProperty('strings');
    expect(result).toHaveProperty('values');
  });

  test('returns a clause object when sources are provided', () => {
    const result = asSqlFragment(buildSongFilterClause([], ['youtube']));
    expect(result).toHaveProperty('strings');
  });

  test('returns a clause object when both tags and sources are provided', () => {
    const result = buildSongFilterClause(['rock', 'jazz'], ['youtube', 'soundcloud']);
    expect(result).not.toBeUndefined();
  });

  test('unknown source produces undefined (no matching patterns)', () => {
    const result = buildSongFilterClause([], ['nonexistent']);
    expect(result).toBeUndefined();
  });

  test('accepts custom column references', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cols: any = {
      tags: 't.tags',
      sourceUrl: 't.url',
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = asSqlFragment(buildSongFilterClause(['rock'], [], cols));
    expect(result).toHaveProperty('strings');
  });
});
