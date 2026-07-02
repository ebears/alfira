import { logger } from '../shared/logger';
import { updateNodeLinkPlayer } from '../utils/nodelink';
import { lavalink } from './lavalink';

export interface CompressorFilterParams {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
}

/**
 * Build a NodeLink compressor filter payload from numeric parameters.
 * Does not send anything; purely a data transform.
 */
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

/**
 * Applies audio filters to the live NodeLink player for the configured guild.
 * Silently returns if the player is not connected.
 */
export async function applyNodeLinkFilter(
  filters: Record<string, unknown>,
  label: string
): Promise<void> {
  const guildId = process.env.GUILD_ID ?? '';
  if (!guildId) {
    logger.warn(`GUILD_ID not set, skipping NodeLink ${label} filter update`);
    return;
  }
  if (!lavalink.isGuildConnected(guildId)) return;

  const sessionId = lavalink.getSessionId();
  if (!sessionId) return;

  try {
    await updateNodeLinkPlayer(guildId, sessionId, { filters });
  } catch (err) {
    logger.error({ err }, `Failed to update NodeLink ${label} filter`);
  }
}
