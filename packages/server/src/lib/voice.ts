import { createPlayer, getPlayer } from '../manager';
import { logger } from '../shared/logger';
import { getGuildId } from './config';
import { ApiError } from './errors';
import { connectToVoice, getClient, getUserVoiceChannel } from './gatewayState';
import { lavalink } from './lavalink';

/**
 * Verifies the requesting user is in a voice channel.
 * Throws ApiError if the bot is not ready or the user is not in voice.
 *
 * Uses gateway-tracked voice state (no REST call) for fast lookups.
 */
export function requireUserInVoice(discordId: string): void {
  const gateway = getClient();
  if (!gateway || !gateway.isReady()) {
    throw new ApiError(503, 'Discord bot is not ready yet.');
  }

  const voiceChannelId = getUserVoiceChannel(discordId);
  if (!voiceChannelId) {
    throw new ApiError(409, 'You must be in a voice channel to control playback.');
  }
}

/**
 * Returns existing player or auto-joins the user's voice channel.
 * Throws ApiError on failure.
 */
export async function resolveOrAutoJoinPlayer(
  discordId: string
): Promise<NonNullable<ReturnType<typeof getPlayer>>> {
  const guildId = getGuildId();
  const existingPlayer = getPlayer(guildId);
  if (existingPlayer && lavalink.isGuildConnected(guildId)) {
    return existingPlayer;
  }

  const gateway = getClient();
  if (!gateway || !gateway.isReady()) {
    throw new ApiError(503, 'Discord bot is not ready yet.');
  }

  const voiceChannelId = getUserVoiceChannel(discordId);
  if (!voiceChannelId) {
    throw new ApiError(
      409,
      'You are not in a voice channel. Join a voice channel in Discord first.'
    );
  }

  try {
    // Connect to voice via the Discord gateway, then create the GuildPlayer.
    await connectToVoice(guildId, voiceChannelId);
    // Give NodeLink time to fully establish the voice connection
    // before we start sending track data.
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    return createPlayer(guildId, voiceChannelId);
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error) },
      'Failed to auto-join voice channel'
    );
    throw new ApiError(
      503,
      'Could not connect to your voice channel. Try using /join in Discord first.'
    );
  }
}
