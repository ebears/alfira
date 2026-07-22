import { DiscordGateway } from './lib/discordGateway';
import {
  completePendingConnection,
  getBotUserId,
  setBotUserId,
  setGateway,
  setPendingConnectionDetails,
} from './lib/gatewayState';
import { lavalink } from './lib/lavalink';
import { getPlayer } from './manager';
import { logger } from './shared/logger';

export type { GuildPlayer } from './GuildPlayer';
export { createPlayer, destroyAllPlayers, getPlayer } from './manager';
export {
  getEnabledSourceDisplayNames,
  getMetadata,
  getPlaylistMetadataWithVideos,
  initEnabledSources,
  isPlaylistUrl,
  isValidSourceUrl,
  type PlaylistMetadata,
  refreshEnabledSources,
  SOURCE_DEFINITIONS,
} from './utils/nodelink';

// Re-export gateway state for backward-compatible imports.
export { connectToVoice, getClient, getUserVoiceChannel } from './lib/gatewayState';

const NODELINK_URL = 'http://127.0.0.1:2333';
const NODELINK_AUTH = 'nodelink-internal';

// ---------------------------------------------------------------------------
// Voice membership tracking (for auto-pause)
// ---------------------------------------------------------------------------

// Maps voiceChannelId -> Set of human userIds currently in that channel.
const humanVoiceMembers = new Map<string, Set<string>>();

// Tracks previous voice channel per user for change detection.
const prevVoiceChannel = new Map<string, string | null>();

// ---------------------------------------------------------------------------
// Gateway event handlers
// ---------------------------------------------------------------------------

function handleVoiceStateUpdate(data: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const d = data as {
    guild_id: string;
    user_id: string;
    channel_id: string | null;
    session_id?: string;
    member?: { user?: { bot?: boolean } };
  };

  const guildId = d.guild_id;
  const userId = d.user_id;
  const channelId = d.channel_id;
  const isBot = d.member?.user?.bot === true;

  // Track our own bot's voice session ID for pending voice connections.
  if (userId === getBotUserId() && d.session_id) {
    completePendingConnection(guildId, d.session_id);
  }

  // --- Update human voice membership ---
  const oldChannelId = prevVoiceChannel.get(userId);

  if (channelId === null) {
    // User left voice — remove from all channel tracking.
    for (const [, members] of humanVoiceMembers) {
      members.delete(userId);
    }
  } else if (!isBot) {
    // Non-bot user joined or moved channels.
    let members = humanVoiceMembers.get(channelId);
    if (!members) {
      members = new Set();
      humanVoiceMembers.set(channelId, members);
    }
    members.add(userId);

    // If they moved from another channel, remove from old tracking.
    if (oldChannelId && oldChannelId !== channelId) {
      humanVoiceMembers.get(oldChannelId)?.delete(userId);
    }
  }

  // --- Auto-pause check ---
  if (oldChannelId && oldChannelId !== channelId) {
    // The user changed channels — check if they left the bot's channel.
    const guildPlayer = getPlayer(guildId);
    const botChannelId = guildPlayer?.getVoiceId();

    if (
      botChannelId &&
      oldChannelId === botChannelId &&
      lavalink.isGuildConnected(guildId) &&
      guildPlayer
    ) {
      const wasHuman = !isBot;

      if (wasHuman) {
        const channelMembers = humanVoiceMembers.get(botChannelId);
        const humanCount = channelMembers?.size ?? 0;

        if (humanCount === 0) {
          humanVoiceMembers.delete(botChannelId);
          if (guildPlayer.getCurrentSong() && guildPlayer.isPlaying()) {
            void guildPlayer.togglePause();
            logger.info({ guildId }, "Auto-paused: no humans left in the bot's voice channel.");
          }
        }
      }
    }
  }

  // Update previous channel tracking.
  if (channelId) {
    prevVoiceChannel.set(userId, channelId);
  } else {
    prevVoiceChannel.delete(userId);
  }
}

function handleVoiceServerUpdate(data: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const d = data as { guild_id: string; token: string; endpoint: string };
  setPendingConnectionDetails(d.guild_id, d.token, d.endpoint);
}

function handleReady(data: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const ready = data as { user: { id: string; username: string } };
  setBotUserId(ready.user.id);
  logger.info(`Bot logged in as ${ready.user.username}`);

  // Now that we have the bot's Discord user ID, connect to NodeLink.
  const nodelinkParsed = new URL(NODELINK_URL);
  const wsProtocol = nodelinkParsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${nodelinkParsed.hostname}:${nodelinkParsed.port || 2333}/v4/websocket`;

  void (async () => {
    try {
      await lavalink.connect(wsUrl, NODELINK_AUTH, ready.user.id);
      logger.info('Lavalink WebSocket connected');
    } catch (error) {
      logger.error({ error }, 'Lavalink WebSocket connection failed — audio will be unavailable');
    }
  })();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/** Initializes and connects the Discord bot. Called by the server entry point. */
export async function startDiscord(): Promise<void> {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

  if (!DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_BOT_TOKEN is not set.');
  }

  // GatewayIntentBits.Guilds = 1, GuildVoiceStates = 128
  const intents = 1 | 128;

  const gateway = new DiscordGateway(DISCORD_BOT_TOKEN, intents);

  // Register event handlers.
  gateway.onDispatch((eventName, data) => {
    switch (eventName) {
      case 'READY':
        handleReady(data);
        break;
      case 'VOICE_STATE_UPDATE':
        handleVoiceStateUpdate(data);
        break;
      case 'VOICE_SERVER_UPDATE':
        handleVoiceServerUpdate(data);
        break;
    }
  });

  setGateway(gateway);
  await gateway.start();
}
