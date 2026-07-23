import { tables } from '../shared/db';

const EQ_BAND_COLUMNS = {
  eqBand0: tables.guildSettings.eqBand0,
  eqBand1: tables.guildSettings.eqBand1,
  eqBand2: tables.guildSettings.eqBand2,
  eqBand3: tables.guildSettings.eqBand3,
  eqBand4: tables.guildSettings.eqBand4,
  eqBand5: tables.guildSettings.eqBand5,
  eqBand6: tables.guildSettings.eqBand6,
  eqBand7: tables.guildSettings.eqBand7,
  eqBand8: tables.guildSettings.eqBand8,
  eqBand9: tables.guildSettings.eqBand9,
  eqBand10: tables.guildSettings.eqBand10,
  eqBand11: tables.guildSettings.eqBand11,
  eqBand12: tables.guildSettings.eqBand12,
  eqBand13: tables.guildSettings.eqBand13,
  eqBand14: tables.guildSettings.eqBand14,
};

export { EQ_BAND_COLUMNS };

const BAND_KEYS = [
  'eqBand0',
  'eqBand1',
  'eqBand2',
  'eqBand3',
  'eqBand4',
  'eqBand5',
  'eqBand6',
  'eqBand7',
  'eqBand8',
  'eqBand9',
  'eqBand10',
  'eqBand11',
  'eqBand12',
  'eqBand13',
  'eqBand14',
] as const;

type EqBandKey = (typeof BAND_KEYS)[number];

interface EqSettingsRow {
  eqBand0: number;
  eqBand1: number;
  eqBand2: number;
  eqBand3: number;
  eqBand4: number;
  eqBand5: number;
  eqBand6: number;
  eqBand7: number;
  eqBand8: number;
  eqBand9: number;
  eqBand10: number;
  eqBand11: number;
  eqBand12: number;
  eqBand13: number;
  eqBand14: number;
}

export function eqBandsFromRow(row: EqSettingsRow | null | undefined): number[] {
  if (!row) {
    const defaults = Array<number>(15).fill(50);
    return defaults;
  }
  return BAND_KEYS.map((key) => row[key]);
}

export function eqBandValues(bands: number[]): Record<EqBandKey, number> {
  const result: Record<string, number> = {};
  for (let i = 0; i < 15; i++) {
    result[`eqBand${i}`] = bands[i]!;
  }
  return result;
}

/**
 * Convert band values (0-100) to NodeLink equalizer filter format.
 * Maps: 0 → -0.5, 50 → 0.0 (neutral/flat), 100 → 0.5
 */
export function buildEqualizerFilter(bands: number[]): { band: number; gain: number }[] {
  return bands.map((value, index) => ({
    band: index,
    gain: (value - 50) / 100,
  }));
}
