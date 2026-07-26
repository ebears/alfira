import { createPlayer, getPlayer } from '../manager';
import { logger } from '../shared/logger';
import { getGuildId } from './config';
import { connectToVoice, getClient, getUserVoiceChannel } from './gatewayState';
import { json } from './json';
import { lavalink } from './lavalink';

/**
 * Verifies the requesting user is in a voice channel.
 * Returns true if in voice, error Response otherwise.
 *
 * Uses gateway-tracked voice state (no REST call) for fast lookups.
 */
export function requireUserInVoice(discordId: string): true | Response {
  const gateway = getClient();
  if (!gateway || !gateway.isReady()) {
    return json({ error: 'Discord bot is not ready yet.', code: 'BOT_NOT_READY' }, 503);
  }

  const voiceChannelId = getUserVoiceChannel(discordId);
  if (!voiceChannelId) {
    return json(
      { error: 'You must be in a voice channel to control playback.', code: 'NOT_IN_VOICE' },
      409
    );
  }

  return true;
}

/**
 * Returns existing player or auto-joins the user's voice channel.
 * Returns the player on success, error Response on failure.
 */
export async function resolveOrAutoJoinPlayer(
  discordId: string
): Promise<
  | { ok: true; player: NonNullable<ReturnType<typeof getPlayer>> }
  | { ok: false; response: Response }
> {
  const guildId = getGuildId();
  const existingPlayer = getPlayer(guildId);
  if (existingPlayer && lavalink.isGuildConnected(guildId)) {
    return { ok: true, player: existingPlayer };
  }

  const gateway = getClient();
  if (!gateway || !gateway.isReady()) {
    return {
      ok: false,
      response: json({ error: 'Discord bot is not ready yet.', code: 'BOT_NOT_READY' }, 503),
    };
  }

  const voiceChannelId = getUserVoiceChannel(discordId);
  if (!voiceChannelId) {
    return {
      ok: false,
      response: json(
        {
          error: 'You are not in a voice channel. Join a voice channel in Discord first.',
          code: 'NOT_IN_VOICE',
        },
        409
      ),
    };
  }

  try {
    // Connect to voice via the Discord gateway, then create the GuildPlayer.
    await connectToVoice(guildId, voiceChannelId);
    // Give NodeLink time to fully establish the voice connection
    // before we start sending track data.
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    return { ok: true, player: createPlayer(guildId, voiceChannelId) };
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error) },
      'Failed to auto-join voice channel'
    );
    return {
      ok: false,
      response: json(
        {
          error: 'Could not connect to your voice channel. Try using /join in Discord first.',
          code: 'VOICE_CONNECTION_FAILED',
        },
        503
      ),
    };
  }
}
