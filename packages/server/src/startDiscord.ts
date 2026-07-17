import { Client, createEvent } from 'seyfert';
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
// Client singleton
// ---------------------------------------------------------------------------

let _client: Client | null = null;
let _botUserId: string | null = null;

export function setClient(client: Client): void {
  _client = client;
}

export function getClient(): Client | null {
  return _client;
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
    const client = getClient();
    if (!client) {
      reject(new Error('Discord client not ready'));
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

    const shardId = client.gateway.calculateShardId(guildId);
    client.gateway.send(shardId, {
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
// Voice membership tracking
// ---------------------------------------------------------------------------

// Voice channel membership tracking for auto-pause.
// Maps voiceChannelId -> Set of human userIds currently in that channel.
const humanVoiceMembers = new Map<string, Set<string>>();

// Process raw gateway packets for voice connection and human tracking.
const rawEvent = createEvent({
  data: { name: 'raw' as const },
  run(packet, _client) {
    // Track human users in voice channels for auto-pause.
    if (packet.t === 'VOICE_STATE_UPDATE') {
      const d = packet.d as {
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

      // Update human voice membership tracking.
      // For disconnects (channelId === null), we rely on the member data being present
      // in the raw payload before cache updates.
      if (channelId === null) {
        // User left a channel - remove from all channel tracking.
        for (const [_chId, members] of humanVoiceMembers) {
          members.delete(userId);
        }
      } else if (!isBot) {
        // Non-bot user joined or stayed in a channel.
        let members = humanVoiceMembers.get(channelId);
        if (!members) {
          members = new Set();
          humanVoiceMembers.set(channelId, members);
        }
        members.add(userId);
      }
    }

    // Process VOICE_SERVER_UPDATE for pending voice connections.
    if (packet.t === 'VOICE_SERVER_UPDATE') {
      const d = packet.d as { guild_id: string; token: string; endpoint: string };
      const pending = pendingVoiceConnections.get(d.guild_id);
      if (pending) {
        pending.token = d.token;
        pending.endpoint = d.endpoint;
        tryCompleteVoiceConnection(d.guild_id);
      }
    }
  },
});

// Auto-pause: when all humans leave the bot's voice channel.
const voiceStateUpdateEvent = createEvent({
  data: { name: 'voiceStateUpdate' as const },
  run(state, oldState, _client) {
    // Seyfert passes [state] or [state, oldState]; destructure appropriately.
    const currentState = Array.isArray(state) ? state[0] : state;
    const previousState = Array.isArray(state) ? state[1] : oldState;

    // Ignore if both old and new state have no channel change.
    const oldChannelId = (previousState as { channelId: string | null } | undefined)?.channelId;
    const newChannelId = (currentState as { channelId: string | null }).channelId;
    if (oldChannelId === newChannelId) return;

    const guildId =
      (currentState as { guildId: string }).guildId ??
      (previousState as { guildId?: string })?.guildId;
    if (!guildId) return;

    if (!lavalink.isGuildConnected(guildId)) return;

    // Get the bot's voice channel ID from our GuildPlayer.
    const guildPlayer = getPlayer(guildId);
    const botChannelId = guildPlayer?.getVoiceId();
    if (!botChannelId) return;

    // Check if someone left the bot's channel.
    const leftBotChannel = oldChannelId === botChannelId && newChannelId !== botChannelId;
    if (!leftBotChannel) return;

    // Determine if the leaving user was a human.
    // The raw event may have added them to humanVoiceMembers. If not found there,
    // we check via the member's user object.
    let wasHuman =
      humanVoiceMembers.get(botChannelId)?.has((currentState as { userId: string }).userId) ??
      false;
    const previousStateWithMember = previousState as
      | { member?: { user?: { bot?: boolean } } }
      | undefined;
    if (!wasHuman && previousStateWithMember?.member) {
      wasHuman = !(previousStateWithMember.member?.user?.bot === true);
    }

    if (!wasHuman) return;

    // Count remaining humans in the bot's voice channel.
    const channelMembers = humanVoiceMembers.get(botChannelId);
    const humanCount = channelMembers?.size ?? 0;

    if (humanCount === 0) {
      const guildPlayer = getPlayer(guildId);
      if (guildPlayer?.getCurrentSong() && guildPlayer.isPlaying()) {
        guildPlayer.togglePause();
        logger.info({ guildId }, "Auto-paused: no humans left in the bot's voice channel.");
      }
    }
  },
});

const readyEvent = createEvent({
  data: { name: 'ready' as const, once: true },
  run(user, _client) {
    _botUserId = user.id;
    logger.info(`Bot logged in as ${user.username}`);

    // Now that we have the bot's Discord user ID, connect to NodeLink.
    const nodelinkParsed = new URL(NODELINK_URL);
    const wsProtocol = nodelinkParsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${nodelinkParsed.hostname}:${nodelinkParsed.port || 2333}/v4/websocket`;

    lavalink.connect(wsUrl, NODELINK_AUTH, user.id).then(
      () => logger.info('Lavalink WebSocket connected'),
      (err: Error) =>
        logger.error({ err }, 'Lavalink WebSocket connection failed — audio will be unavailable')
    );
  },
});

/** Initializes and connects the Discord bot. Called by the server entry point. */
export async function startDiscord(): Promise<void> {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

  if (!DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_BOT_TOKEN is not set.');
  }

  // GatewayIntentBits.Guilds = 1, GuildVoiceStates = 128
  const intents = 1 | 128;

  const client = new Client({
    // Provide a minimal getRC to avoid needing a seyfert.config file.
    // Locations are empty since we set events programmatically.
    getRC: () => ({
      token: DISCORD_BOT_TOKEN,
      locations: { base: '' },
      intents,
      debug: false,
    }),
  });

  setClient(client);

  // Register events before client.start(). The ready event handler
  // will connect to NodeLink once we have the bot's Discord user ID.
  // Seyfert's ClientEvent type requires `once: boolean` on every event,
  // but createEvent returns `once?: boolean`. The values are correct at
  // runtime — events have `once` set where needed.
  client.events.set([readyEvent, rawEvent, voiceStateUpdateEvent] as Parameters<
    typeof client.events.set
  >[0]);

  await client.start();
}
