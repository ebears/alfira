import { eq } from 'drizzle-orm';

import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';
import { updateNodeLinkPlayer } from '../utils/nodelink';
import {
  buildChannelMixFilter,
  buildCompressorFilter,
  buildDistortionFilter,
  buildKaraokeFilter,
  buildLowPassFilter,
  buildRotationFilter,
  buildTimescaleFilter,
  buildTremoloFilter,
  buildVibratoFilter,
} from './applyNodeLinkFilter';
import { getGuildId } from './config';
import { buildEqualizerFilter } from './eqBands';
import { lavalink } from './lavalink';

/**
 * Read all filter settings from the database, build a combined NodeLink
 * Filters object for every enabled filter, and send a single PATCH to the
 * live player.
 *
 * This is the single point of truth for filter application — every filter
 * route calls this after saving its own settings.  It guarantees that
 * enabling multiple filters at once sends everything in one payload rather
 * than one filter overwriting the others.
 */
export async function syncAllFilters(): Promise<void> {
  const guildId = getGuildId();
  if (!guildId) {
    return;
  }
  if (!lavalink.isGuildConnected(guildId)) {
    return;
  }

  const sessionId = lavalink.getSessionId();
  if (!sessionId) {
    return;
  }

  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  if (!row) {
    return;
  }

  const filters: Record<string, unknown> = {};

  // Compressor
  if (row.compressorEnabled) {
    filters.compressor = buildCompressorFilter({
      threshold: row.compressorThreshold,
      ratio: row.compressorRatio,
      attack: row.compressorAttack,
      release: row.compressorRelease,
      gain: row.compressorGain,
    }).compressor;
  }

  // Equalizer
  if (row.eqEnabled) {
    const bands = Array.from({ length: 15 }, (_, i) => {
      const key = `eqBand${i}` as keyof typeof row;
      return row[key] as number;
    });
    filters.equalizer = buildEqualizerFilter(bands);
  }

  // Karaoke
  if (row.karaokeEnabled) {
    filters.karaoke = buildKaraokeFilter({
      level: row.karaokeLevel,
      monoLevel: row.karaokeMonoLevel,
      filterBand: row.karaokeFilterBand,
      filterWidth: row.karaokeFilterWidth,
    }).karaoke;
  }

  // Timescale
  if (row.timescaleEnabled) {
    filters.timescale = buildTimescaleFilter({
      speed: row.timescaleSpeed,
      pitch: row.timescalePitch,
      rate: row.timescaleRate,
    }).timescale;
  }

  // Tremolo
  if (row.tremoloEnabled) {
    filters.tremolo = buildTremoloFilter({
      frequency: row.tremoloFrequency,
      depth: row.tremoloDepth,
    }).tremolo;
  }

  // Vibrato
  if (row.vibratoEnabled) {
    filters.vibrato = buildVibratoFilter({
      frequency: row.vibratoFrequency,
      depth: row.vibratoDepth,
    }).vibrato;
  }

  // Rotation
  if (row.rotationEnabled) {
    filters.rotation = buildRotationFilter({
      rotationHz: row.rotationHz,
    }).rotation;
  }

  // Distortion
  if (row.distortionEnabled) {
    filters.distortion = buildDistortionFilter({
      sinOffset: row.distortionSinOffset,
      sinScale: row.distortionSinScale,
      cosOffset: row.distortionCosOffset,
      cosScale: row.distortionCosScale,
      tanOffset: row.distortionTanOffset,
      tanScale: row.distortionTanScale,
      offset: row.distortionOffset,
      scale: row.distortionScale,
    }).distortion;
  }

  // Channel mix
  if (row.channelMixEnabled) {
    filters.channelMix = buildChannelMixFilter({
      leftToLeft: row.channelMixLeftToLeft,
      leftToRight: row.channelMixLeftToRight,
      rightToLeft: row.channelMixRightToLeft,
      rightToRight: row.channelMixRightToRight,
    }).channelMix;
  }

  // Low pass
  if (row.lowPassEnabled) {
    filters.lowPass = buildLowPassFilter({
      smoothing: row.lowPassSmoothing,
    }).lowPass;
  }

  try {
    await updateNodeLinkPlayer(guildId, sessionId, { filters });
  } catch (err) {
    logger.error({ err }, 'Failed to sync audio filters to NodeLink');
  }
}
