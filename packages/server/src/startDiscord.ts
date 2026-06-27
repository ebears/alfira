import { Client, createEvent } from 'seyfert';
import { emitPlayerUpdate } from './lib/socket';
import { getPlayer } from './manager';
import type { QueueState } from './shared';
import { logger } from './shared/logger';

export type { DestroyReasons } from 'hoshimi';
export type { GuildPlayer } from './GuildPlayer';
export { createPlayer, destroyAllPlayers, getPlayer } from './manager';
export {
  getMetadata,
  getPlaylistMetadataWithVideos,
  isValidYouTubeUrl,
  isYouTubePlaylistUrl,
  type PlaylistMetadata,
} from './utils/nodelink';

const NODELINK_URL = 'http://127.0.0.1:2333';
const NODELINK_AUTH = 'nodelink-internal';

// ---------------------------------------------------------------------------
// Client singleton (inlined from former lib/client.ts)
// ---------------------------------------------------------------------------
import type { Hoshimi } from 'hoshimi';

let _client: Client | null = null;
let _hoshimi: Hoshimi | null = null;

export function setClient(client: Client): void {
  _client = client;
}

export function getClient(): Client | null {
  return _client;
}

export function setHoshimi(hoshimi: Hoshimi): void {
  _hoshimi = hoshimi;
}

export function getHoshimi(): Hoshimi | null {
  return _hoshimi;
}

// ---------------------------------------------------------------------------
// Broadcast (inlined — calls emitPlayerUpdate directly, no more indirection)
// ---------------------------------------------------------------------------

/**
 * Called by GuildPlayer after every state-changing operation.
 */
export function broadcastQueueUpdate(state: QueueState): void {
  emitPlayerUpdate(state);
}

// ---------------------------------------------------------------------------
// Voice membership tracking
// ---------------------------------------------------------------------------

// Voice channel membership tracking for auto-pause.
// Maps voiceChannelId -> Set of human userIds currently in that channel.
const humanVoiceMembers = new Map<string, Set<string>>();

// Forward raw gateway packets to hoshimi so it can handle voice server updates.
const rawEvent = createEvent({
  data: { name: 'raw' as const },
  run(packet, _client) {
    const hoshimi = getHoshimi();
    if (!hoshimi) return;
    // hoshimi expects GatewayDispatchPayload but Seyfert passes it with extra wrapper;
    // the raw packet has `t` and `d` properties that hoshimi reads directly
    hoshimi.updateVoiceState(packet as Parameters<typeof hoshimi.updateVoiceState>[0]);

    // Track human users in voice channels for auto-pause.
    if (packet.t === 'VOICE_STATE_UPDATE') {
      const d = packet.d as {
        guild_id: string;
        user_id: string;
        channel_id: string | null;
        member?: { user?: { bot?: boolean } };
      };
      const _guildId = d.guild_id;
      const userId = d.user_id;
      const channelId = d.channel_id;
      const isBot = d.member?.user?.bot === true;

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

    const hoshimi = getHoshimi();
    if (!hoshimi) return;

    const player = hoshimi.players.get(guildId);
    if (!player) return;

    const botChannelId = player.voiceId;
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
    const hoshimi = getHoshimi();
    if (hoshimi) {
      hoshimi.init({ id: user.id, username: user.username });
    }
    logger.info(`Bot logged in as ${user.username}`);
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
    getRC: async () => ({
      token: DISCORD_BOT_TOKEN,
      locations: { base: '' },
      intents,
      debug: false,
    }),
  });

  setClient(client);

  // Initialize Hoshimi manager for audio.
  const { Hoshimi } = await import('hoshimi');
  const nodelinkParsed = new URL(NODELINK_URL);

  const hoshimi = new Hoshimi({
    sendPayload: (guildId: string, payload: unknown) => {
      const shardId = client.gateway.calculateShardId(guildId);
      // @ts-expect-error - hoshimi sends raw gateway payloads; gateway accepts them at runtime
      client.gateway.send(shardId, payload);
    },
    nodes: [
      {
        host: nodelinkParsed.hostname,
        port: Number(nodelinkParsed.port) || (nodelinkParsed.protocol === 'https:' ? 443 : 2333),
        password: NODELINK_AUTH,
        secure: nodelinkParsed.protocol === 'https:',
      },
    ],
    client: {
      id: '',
      username: '',
    },
  });

  setHoshimi(hoshimi);

  await client.start();

  // Register events after start.
  // biome-ignore lint/suspicious/noExplicitAny: createEvent return has `once?: boolean` but ClientEvent needs `once: boolean`; values are correct at runtime
  client.events.set([readyEvent, rawEvent, voiceStateUpdateEvent] as any);
}
