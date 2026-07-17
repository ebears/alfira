import { DiscordGateway } from './lib/discordGateway';
import { lavalink } from './lib/lavalink';
import { getPlayer } from './manager';
import { logger } from './shared/logger';
import { updateNodeLinkPlayer } from './utils/nodelink';

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

const NODELINK_URL = 'http://127.0.0.1:2333';
const NODELINK_AUTH = 'nodelink-internal';

// ---------------------------------------------------------------------------
// Gateway singleton
// ---------------------------------------------------------------------------

let _gateway: DiscordGateway | null = null;
let _botUserId: string | null = null;

export function getClient(): DiscordGateway | null {
  return _gateway;
}

export function getUserVoiceChannel(userId: string): string | null {
  return _gateway?.getUserVoiceChannel(userId) ?? null;
}

// ---------------------------------------------------------------------------
// Voice connection (direct Discord gateway)
// ---------------------------------------------------------------------------

interface PendingVoiceConnection {
  voiceChannelId: string;
  sessionId: string | null;
  token: string | null;
  endpoint: string | null;
  resolve: () => void;
  reject: (err: Error) => void;
}

const pendingVoiceConnections = new Map<string, PendingVoiceConnection>();

function tryCompleteVoiceConnection(guildId: string): void {
  const pending = pendingVoiceConnections.get(guildId);
  if (!pending) return;
  if (!pending.sessionId || !pending.token || !pending.endpoint) return;

  const sessionId = lavalink.getSessionId();
  if (!sessionId) {
    // Lavalink WebSocket hasn't received its 'ready' event yet.
    // Retry in 200ms — the connection was just initiated.
    setTimeout(() => tryCompleteVoiceConnection(guildId), 200);
    return;
  }

  pendingVoiceConnections.delete(guildId);

  updateNodeLinkPlayer(guildId, sessionId, {
    voice: {
      token: pending.token,
      endpoint: pending.endpoint,
      sessionId: pending.sessionId,
    },
  })
    .then(() => {
      lavalink.markConnected(guildId, true);
      pending.resolve();
    })
    .catch((err: Error) => pending.reject(err));
}

/**
 * Connect the bot to a voice channel.
 *
 * Sends VOICE_STATE_UPDATE (op 4) to the Discord gateway and resolves
 * once the voice server data has been forwarded to NodeLink.
 */
export function connectToVoice(guildId: string, voiceChannelId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const gateway = _gateway;
    if (!gateway) {
      reject(new Error('Discord gateway not ready'));
      return;
    }

    pendingVoiceConnections.set(guildId, {
      voiceChannelId,
      sessionId: null,
      token: null,
      endpoint: null,
      resolve,
      reject,
    });

    gateway.send({
      op: 4,
      d: {
        guild_id: guildId,
        channel_id: voiceChannelId,
        self_mute: false,
        self_deaf: false,
      },
    });
  });
}

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
  if (userId === _botUserId) {
    const pending = pendingVoiceConnections.get(guildId);
    if (pending && d.session_id) {
      pending.sessionId = d.session_id;
      tryCompleteVoiceConnection(guildId);
    }
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
            guildPlayer.togglePause();
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
  const d = data as { guild_id: string; token: string; endpoint: string };
  const pending = pendingVoiceConnections.get(d.guild_id);
  if (pending) {
    pending.token = d.token;
    pending.endpoint = d.endpoint;
    tryCompleteVoiceConnection(d.guild_id);
  }
}

function handleReady(data: unknown): void {
  const ready = data as { user: { id: string; username: string } };
  _botUserId = ready.user.id;
  logger.info(`Bot logged in as ${ready.user.username}`);

  // Now that we have the bot's Discord user ID, connect to NodeLink.
  const nodelinkParsed = new URL(NODELINK_URL);
  const wsProtocol = nodelinkParsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${nodelinkParsed.hostname}:${nodelinkParsed.port || 2333}/v4/websocket`;

  lavalink.connect(wsUrl, NODELINK_AUTH, ready.user.id).then(
    () => logger.info('Lavalink WebSocket connected'),
    (err: Error) =>
      logger.error({ err }, 'Lavalink WebSocket connection failed — audio will be unavailable')
  );
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

  _gateway = gateway;
  await gateway.start();
}
