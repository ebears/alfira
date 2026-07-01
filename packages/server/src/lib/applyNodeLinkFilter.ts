import { getHoshimi } from '../startDiscord';
import { logger } from './config';

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
  const hoshimi = getHoshimi();
  if (!hoshimi) return;
  const player = hoshimi.players.get(guildId);
  if (!player?.connected) return;
  try {
    await player.node.rest.updatePlayer({
      guildId,
      playerOptions: { filters },
    });
  } catch (err) {
    logger.error({ err }, `Failed to update NodeLink ${label} filter`);
  }
}
