import { createPlayer, getClient, getHoshimi, getPlayer } from '../startDiscord';
import { GUILD_ID, logger } from './config';
import { json } from './json';

/**
 * Verifies the requesting user is in a voice channel.
 * Returns true if in voice, error Response otherwise.
 */
export async function requireUserInVoice(discordId: string): Promise<true | Response> {
  const client = getClient();
  if (!client) {
    return json({ error: 'Discord bot is not ready yet.', code: 'BOT_NOT_READY' }, 503);
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.resolve(discordId);

    if (!member) {
      return json({ error: 'Could not find member in guild.', code: 'MEMBER_NOT_FOUND' }, 404);
    }

    const voiceState = await member.voice('rest');
    if (!voiceState?.channelId) {
      return json(
        { error: 'You must be in a voice channel to control playback.', code: 'NOT_IN_VOICE' },
        409
      );
    }

    return true;
  } catch (error) {
    logger.error({ err: error as Error }, 'Failed to verify voice channel membership');
    return json(
      { error: 'Could not verify voice channel membership.', code: 'VOICE_CHECK_FAILED' },
      503
    );
  }
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
  const existingPlayer = getPlayer(GUILD_ID);
  if (existingPlayer) {
    const hoshimi = getHoshimi();
    const hoshimiPlayer = hoshimi?.players.get(GUILD_ID);
    if (hoshimiPlayer?.connected) {
      return { ok: true, player: existingPlayer };
    }
  }

  const discordClient = getClient();
  if (!discordClient) {
    return {
      ok: false,
      response: json({ error: 'Discord bot is not ready yet.', code: 'BOT_NOT_READY' }, 503),
    };
  }

  const hoshimi = getHoshimi();
  if (!hoshimi) {
    return {
      ok: false,
      response: json({ error: 'Audio node is not ready yet.', code: 'NODELINK_NOT_READY' }, 503),
    };
  }

  try {
    const guild = await discordClient.guilds.fetch(GUILD_ID);
    const member = await guild.members.resolve(discordId);

    if (!member) {
      return {
        ok: false,
        response: json({ error: 'Could not find member in guild.', code: 'MEMBER_NOT_FOUND' }, 404),
      };
    }

    const voiceState = await member.voice('rest');
    const voiceChannelId = voiceState?.channelId;

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

    // Create Hoshimi player and connect to the voice channel.
    const player = hoshimi.createPlayer({ guildId: GUILD_ID, voiceId: voiceChannelId });
    await player.connect();
    player.setVoice({ voiceId: voiceChannelId });

    // Wait briefly for connection to establish.
    await new Promise((resolve) => setTimeout(resolve, 500));

    return { ok: true, player: createPlayer(GUILD_ID, voiceChannelId) };
  } catch (error) {
    logger.error({ err: error as Error }, 'Failed to auto-join voice channel');
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
