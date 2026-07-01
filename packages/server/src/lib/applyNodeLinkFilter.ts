import { updateNodeLinkPlayer } from '../utils/nodelink';
import { logger } from './config';
import { lavalink } from './lavalink';

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
