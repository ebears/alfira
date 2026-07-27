import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
import { EQ_BAND_COLUMNS, eqBandsFromRow } from '../lib/eqBands';
import { db, tables } from '../shared/db';
import {
  DEFAULT_CHANNEL_MIX,
  DEFAULT_COMPRESSOR,
  DEFAULT_DISTORTION,
  DEFAULT_EQUALIZER,
  DEFAULT_KARAOKE,
  DEFAULT_LOW_PASS,
  DEFAULT_ROTATION,
  DEFAULT_TIMESCALE,
  DEFAULT_TREMOLO,
  DEFAULT_VIBRATO,
} from '../shared/filterDefaults';

// ---------------------------------------------------------------------------
// Query helper
// ---------------------------------------------------------------------------

function fetchAllFilters() {
  const row = db
    .select({
      ...EQ_BAND_COLUMNS,
      eqEnabled: tables.guildSettings.eqEnabled,
      compressorEnabled: tables.guildSettings.compressorEnabled,
      compressorThreshold: tables.guildSettings.compressorThreshold,
      compressorRatio: tables.guildSettings.compressorRatio,
      compressorAttack: tables.guildSettings.compressorAttack,
      compressorRelease: tables.guildSettings.compressorRelease,
      compressorGain: tables.guildSettings.compressorGain,
      karaokeEnabled: tables.guildSettings.karaokeEnabled,
      karaokeLevel: tables.guildSettings.karaokeLevel,
      karaokeMonoLevel: tables.guildSettings.karaokeMonoLevel,
      karaokeFilterBand: tables.guildSettings.karaokeFilterBand,
      karaokeFilterWidth: tables.guildSettings.karaokeFilterWidth,
      timescaleEnabled: tables.guildSettings.timescaleEnabled,
      timescaleSpeed: tables.guildSettings.timescaleSpeed,
      timescalePitch: tables.guildSettings.timescalePitch,
      timescaleRate: tables.guildSettings.timescaleRate,
      tremoloEnabled: tables.guildSettings.tremoloEnabled,
      tremoloFrequency: tables.guildSettings.tremoloFrequency,
      tremoloDepth: tables.guildSettings.tremoloDepth,
      vibratoEnabled: tables.guildSettings.vibratoEnabled,
      vibratoFrequency: tables.guildSettings.vibratoFrequency,
      vibratoDepth: tables.guildSettings.vibratoDepth,
      rotationEnabled: tables.guildSettings.rotationEnabled,
      rotationHz: tables.guildSettings.rotationHz,
      distortionEnabled: tables.guildSettings.distortionEnabled,
      distortionSinOffset: tables.guildSettings.distortionSinOffset,
      distortionSinScale: tables.guildSettings.distortionSinScale,
      distortionCosOffset: tables.guildSettings.distortionCosOffset,
      distortionCosScale: tables.guildSettings.distortionCosScale,
      distortionTanOffset: tables.guildSettings.distortionTanOffset,
      distortionTanScale: tables.guildSettings.distortionTanScale,
      distortionOffset: tables.guildSettings.distortionOffset,
      distortionScale: tables.guildSettings.distortionScale,
      channelMixEnabled: tables.guildSettings.channelMixEnabled,
      channelMixLeftToLeft: tables.guildSettings.channelMixLeftToLeft,
      channelMixLeftToRight: tables.guildSettings.channelMixLeftToRight,
      channelMixRightToLeft: tables.guildSettings.channelMixRightToLeft,
      channelMixRightToRight: tables.guildSettings.channelMixRightToRight,
      lowPassEnabled: tables.guildSettings.lowPassEnabled,
      lowPassSmoothing: tables.guildSettings.lowPassSmoothing,
    })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  return {
    compressor: {
      enabled: row?.compressorEnabled ?? DEFAULT_COMPRESSOR.enabled,
      threshold: row?.compressorThreshold ?? DEFAULT_COMPRESSOR.threshold,
      ratio: row?.compressorRatio ?? DEFAULT_COMPRESSOR.ratio,
      attack: row?.compressorAttack ?? DEFAULT_COMPRESSOR.attack,
      release: row?.compressorRelease ?? DEFAULT_COMPRESSOR.release,
      gain: row?.compressorGain ?? DEFAULT_COMPRESSOR.gain,
    },
    equalizer: {
      bands: eqBandsFromRow(row),
      enabled: row?.eqEnabled ?? DEFAULT_EQUALIZER.enabled,
    },
    karaoke: {
      enabled: row?.karaokeEnabled ?? DEFAULT_KARAOKE.enabled,
      level: row?.karaokeLevel ?? DEFAULT_KARAOKE.level,
      monoLevel: row?.karaokeMonoLevel ?? DEFAULT_KARAOKE.monoLevel,
      filterBand: row?.karaokeFilterBand ?? DEFAULT_KARAOKE.filterBand,
      filterWidth: row?.karaokeFilterWidth ?? DEFAULT_KARAOKE.filterWidth,
    },
    timescale: {
      enabled: row?.timescaleEnabled ?? DEFAULT_TIMESCALE.enabled,
      speed: row?.timescaleSpeed ?? DEFAULT_TIMESCALE.speed,
      pitch: row?.timescalePitch ?? DEFAULT_TIMESCALE.pitch,
      rate: row?.timescaleRate ?? DEFAULT_TIMESCALE.rate,
    },
    tremolo: {
      enabled: row?.tremoloEnabled ?? DEFAULT_TREMOLO.enabled,
      frequency: row?.tremoloFrequency ?? DEFAULT_TREMOLO.frequency,
      depth: row?.tremoloDepth ?? DEFAULT_TREMOLO.depth,
    },
    vibrato: {
      enabled: row?.vibratoEnabled ?? DEFAULT_VIBRATO.enabled,
      frequency: row?.vibratoFrequency ?? DEFAULT_VIBRATO.frequency,
      depth: row?.vibratoDepth ?? DEFAULT_VIBRATO.depth,
    },
    rotation: {
      enabled: row?.rotationEnabled ?? DEFAULT_ROTATION.enabled,
      rotationHz: row?.rotationHz ?? DEFAULT_ROTATION.rotationHz,
    },
    distortion: {
      enabled: row?.distortionEnabled ?? DEFAULT_DISTORTION.enabled,
      sinOffset: row?.distortionSinOffset ?? DEFAULT_DISTORTION.sinOffset,
      sinScale: row?.distortionSinScale ?? DEFAULT_DISTORTION.sinScale,
      cosOffset: row?.distortionCosOffset ?? DEFAULT_DISTORTION.cosOffset,
      cosScale: row?.distortionCosScale ?? DEFAULT_DISTORTION.cosScale,
      tanOffset: row?.distortionTanOffset ?? DEFAULT_DISTORTION.tanOffset,
      tanScale: row?.distortionTanScale ?? DEFAULT_DISTORTION.tanScale,
      offset: row?.distortionOffset ?? DEFAULT_DISTORTION.offset,
      scale: row?.distortionScale ?? DEFAULT_DISTORTION.scale,
    },
    channelMix: {
      enabled: row?.channelMixEnabled ?? DEFAULT_CHANNEL_MIX.enabled,
      leftToLeft: row?.channelMixLeftToLeft ?? DEFAULT_CHANNEL_MIX.leftToLeft,
      leftToRight: row?.channelMixLeftToRight ?? DEFAULT_CHANNEL_MIX.leftToRight,
      rightToLeft: row?.channelMixRightToLeft ?? DEFAULT_CHANNEL_MIX.rightToLeft,
      rightToRight: row?.channelMixRightToRight ?? DEFAULT_CHANNEL_MIX.rightToRight,
    },
    lowPass: {
      enabled: row?.lowPassEnabled ?? DEFAULT_LOW_PASS.enabled,
      smoothing: row?.lowPassSmoothing ?? DEFAULT_LOW_PASS.smoothing,
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const filtersPlugin = new Elysia({ prefix: '/settings/filters' }).get('/', ((
  ctx: Record<string, unknown>
) => {
  const { user, isAdmin } = getAuth(ctx);
  const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
  if (guardErr) {
    return guardErr;
  }
  return json(fetchAllFilters());
}) as never);
