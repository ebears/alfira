import { logger } from '../shared/logger';
import { updateNodeLinkPlayer } from '../utils/nodelink';
import { getGuildId } from './config';
import { lavalink } from './lavalink';

// ---------------------------------------------------------------------------
// Filter parameter types
// ---------------------------------------------------------------------------

export interface CompressorFilterParams {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
}

export interface KaraokeFilterParams {
  level: number;
  monoLevel: number;
  filterBand: number;
  filterWidth: number;
}

export interface TimescaleFilterParams {
  speed: number;
  pitch: number;
  rate: number;
}

export interface TremoloFilterParams {
  frequency: number;
  depth: number;
}

export interface VibratoFilterParams {
  frequency: number;
  depth: number;
}

export interface RotationFilterParams {
  rotationHz: number;
}

export interface DistortionFilterParams {
  sinOffset: number;
  sinScale: number;
  cosOffset: number;
  cosScale: number;
  tanOffset: number;
  tanScale: number;
  offset: number;
  scale: number;
}

export interface ChannelMixFilterParams {
  leftToLeft: number;
  leftToRight: number;
  rightToLeft: number;
  rightToRight: number;
}

export interface LowPassFilterParams {
  smoothing: number;
}

// ---------------------------------------------------------------------------
// Filter builders — pure data transforms, no side effects
// ---------------------------------------------------------------------------

export function buildCompressorFilter(params: CompressorFilterParams) {
  return {
    compressor: {
      threshold: params.threshold,
      ratio: params.ratio,
      attack: params.attack,
      release: params.release,
      gain: params.gain,
    },
  };
}

export function buildKaraokeFilter(params: KaraokeFilterParams) {
  return {
    karaoke: {
      level: params.level,
      monoLevel: params.monoLevel,
      filterBand: params.filterBand,
      filterWidth: params.filterWidth,
    },
  };
}

export function buildTimescaleFilter(params: TimescaleFilterParams) {
  return {
    timescale: {
      speed: params.speed,
      pitch: params.pitch,
      rate: params.rate,
    },
  };
}

export function buildTremoloFilter(params: TremoloFilterParams) {
  return {
    tremolo: {
      frequency: params.frequency,
      depth: params.depth,
    },
  };
}

export function buildVibratoFilter(params: VibratoFilterParams) {
  return {
    vibrato: {
      frequency: params.frequency,
      depth: params.depth,
    },
  };
}

export function buildRotationFilter(params: RotationFilterParams) {
  return {
    rotation: {
      rotationHz: params.rotationHz,
    },
  };
}

export function buildDistortionFilter(params: DistortionFilterParams) {
  return {
    distortion: {
      sinOffset: params.sinOffset,
      sinScale: params.sinScale,
      cosOffset: params.cosOffset,
      cosScale: params.cosScale,
      tanOffset: params.tanOffset,
      tanScale: params.tanScale,
      offset: params.offset,
      scale: params.scale,
    },
  };
}

export function buildChannelMixFilter(params: ChannelMixFilterParams) {
  return {
    channelMix: {
      leftToLeft: params.leftToLeft,
      leftToRight: params.leftToRight,
      rightToLeft: params.rightToLeft,
      rightToRight: params.rightToRight,
    },
  };
}

export function buildLowPassFilter(params: LowPassFilterParams) {
  return {
    lowPass: {
      smoothing: params.smoothing,
    },
  };
}

// ---------------------------------------------------------------------------
// Legacy — kept for any external callers, but prefer syncAllFilters()
// ---------------------------------------------------------------------------

/**
 * Applies audio filters to the live NodeLink player for the configured guild.
 * Silently returns if the player is not connected.
 */
export async function applyNodeLinkFilter(
  filters: Record<string, unknown>,
  label: string
): Promise<void> {
  const guildId = getGuildId();
  if (!guildId) {
    logger.warn(`GUILD_ID not set, skipping NodeLink ${label} filter update`);
    return;
  }
  if (!lavalink.isGuildConnected(guildId)) {
    return;
  }

  const sessionId = lavalink.getSessionId();
  if (!sessionId) {
    return;
  }

  try {
    await updateNodeLinkPlayer(guildId, sessionId, { filters });
  } catch (error) {
    logger.error({ error }, `Failed to update NodeLink ${label} filter`);
  }
}
