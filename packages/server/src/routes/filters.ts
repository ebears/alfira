import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { EQ_BAND_COLUMNS, eqBandsFromRow } from '../lib/eqBands';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { db, tables } from '../shared/db';

function handleFiltersGet(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Response {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

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

  return json({
    compressor: {
      enabled: row?.compressorEnabled ?? false,
      threshold: row?.compressorThreshold ?? -6,
      ratio: row?.compressorRatio ?? 4,
      attack: row?.compressorAttack ?? 5,
      release: row?.compressorRelease ?? 50,
      gain: row?.compressorGain ?? 3,
    },
    equalizer: {
      bands: eqBandsFromRow(row),
      enabled: row?.eqEnabled ?? true,
    },
    karaoke: {
      enabled: row?.karaokeEnabled ?? false,
      level: row?.karaokeLevel ?? 1,
      monoLevel: row?.karaokeMonoLevel ?? 1,
      filterBand: row?.karaokeFilterBand ?? 220,
      filterWidth: row?.karaokeFilterWidth ?? 100,
    },
    timescale: {
      enabled: row?.timescaleEnabled ?? false,
      speed: row?.timescaleSpeed ?? 1,
      pitch: row?.timescalePitch ?? 1,
      rate: row?.timescaleRate ?? 1,
    },
    tremolo: {
      enabled: row?.tremoloEnabled ?? false,
      frequency: row?.tremoloFrequency ?? 2,
      depth: row?.tremoloDepth ?? 0.5,
    },
    vibrato: {
      enabled: row?.vibratoEnabled ?? false,
      frequency: row?.vibratoFrequency ?? 2,
      depth: row?.vibratoDepth ?? 0.5,
    },
    rotation: {
      enabled: row?.rotationEnabled ?? false,
      rotationHz: row?.rotationHz ?? 0,
    },
    distortion: {
      enabled: row?.distortionEnabled ?? false,
      sinOffset: row?.distortionSinOffset ?? 0,
      sinScale: row?.distortionSinScale ?? 1,
      cosOffset: row?.distortionCosOffset ?? 0,
      cosScale: row?.distortionCosScale ?? 1,
      tanOffset: row?.distortionTanOffset ?? 0,
      tanScale: row?.distortionTanScale ?? 1,
      offset: row?.distortionOffset ?? 0,
      scale: row?.distortionScale ?? 1,
    },
    channelMix: {
      enabled: row?.channelMixEnabled ?? false,
      leftToLeft: row?.channelMixLeftToLeft ?? 1,
      leftToRight: row?.channelMixLeftToRight ?? 0,
      rightToLeft: row?.channelMixRightToLeft ?? 0,
      rightToRight: row?.channelMixRightToRight ?? 1,
    },
    lowPass: {
      enabled: row?.lowPassEnabled ?? false,
      smoothing: row?.lowPassSmoothing ?? 20,
    },
  });
}

export const handleFilters = routeTable('/api/settings/filters', {
  routes: [['GET', '/', handleFiltersGet]],
});
