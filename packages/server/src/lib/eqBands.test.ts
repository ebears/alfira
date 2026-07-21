import { describe, expect, mock, test } from 'bun:test';

// eqBands imports from ../shared/db which requires DATABASE_URL at module
// level. Mock it before the module is loaded (static imports are hoisted,
// so we must use dynamic import after the mock call).
// NOTE: search.test.ts also mocks ../shared/db (with $client). Bun shares
// mock.module registrations across test files, so all mocks must export a
// superset of keys to avoid "export not found" errors.
void mock.module('../shared/db', () => ({
  tables: {
    guildSettings: {
      eqBand0: {},
      eqBand1: {},
      eqBand2: {},
      eqBand3: {},
      eqBand4: {},
      eqBand5: {},
      eqBand6: {},
      eqBand7: {},
      eqBand8: {},
      eqBand9: {},
      eqBand10: {},
      eqBand11: {},
      eqBand12: {},
      eqBand13: {},
      eqBand14: {},
    },
  },
  $client: { query: mock(() => ({ all: mock(() => []) })) },
  db: {},
}));

const { buildEqualizerFilter, eqBandsFromRow, eqBandValues } = await import('./eqBands');

describe('eqBandsFromRow', () => {
  test('returns defaults (all 50) for null or undefined', () => {
    const fromNull = eqBandsFromRow(null);
    expect(fromNull).toHaveLength(15);
    expect(fromNull.every((v) => v === 50)).toBe(true);

    // eslint-disable-next-line unicorn/no-useless-undefined
    const fromUndefined = eqBandsFromRow(undefined);
    expect(fromUndefined).toHaveLength(15);
    expect(fromUndefined.every((v) => v === 50)).toBe(true);
  });

  test('extracts band values from a row', () => {
    const row = {
      eqBand0: 60,
      eqBand1: 45,
      eqBand2: 50,
      eqBand3: 50,
      eqBand4: 50,
      eqBand5: 50,
      eqBand6: 50,
      eqBand7: 50,
      eqBand8: 50,
      eqBand9: 50,
      eqBand10: 50,
      eqBand11: 50,
      eqBand12: 50,
      eqBand13: 50,
      eqBand14: 50,
    };
    const result = eqBandsFromRow(row);
    expect(result[0]).toBe(60);
    expect(result[1]).toBe(45);
    expect(result[2]).toBe(50);
    expect(result).toHaveLength(15);
  });
});

describe('eqBandValues', () => {
  test('converts a 15-element array to a record', () => {
    const bands = Array.from({ length: 15 }, (_, i) => i * 10);
    const result = eqBandValues(bands);
    expect(result.eqBand0).toBe(0);
    expect(result.eqBand7).toBe(70);
    expect(result.eqBand14).toBe(140);
  });
});

describe('buildEqualizerFilter', () => {
  const flat: number[] = Array.from({ length: 15 }, () => 50);

  test('neutral band (50) maps to gain 0', () => {
    const result = buildEqualizerFilter(flat);
    expect(result).toHaveLength(15);
    expect(result.every((f) => f.gain === 0)).toBe(true);
  });

  test('minimum band (0) maps to gain -0.5', () => {
    const bands: number[] = [0, ...flat.slice(1)];
    const result = buildEqualizerFilter(bands);
    expect(result[0]?.gain).toBe(-0.5);
  });

  test('maximum band (100) maps to gain 0.5', () => {
    const bands: number[] = [100, ...flat.slice(1)];
    const result = buildEqualizerFilter(bands);
    expect(result[0]?.gain).toBe(0.5);
  });

  test('bands are zero-indexed', () => {
    const result = buildEqualizerFilter(flat);
    for (const [i, f] of result.entries()) {
      expect(f.band).toBe(i);
    }
  });

  test('mid-scale value maps correctly', () => {
    const bands: number[] = [75, ...flat.slice(1)];
    const result = buildEqualizerFilter(bands);
    expect(result[0]?.gain).toBe(0.25);
  });
});
