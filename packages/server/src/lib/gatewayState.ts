import { updateNodeLinkPlayer } from '../utils/nodelink';
import { type DiscordGateway } from './discordGateway';
import { lavalink } from './lavalink';

// ---------------------------------------------------------------------------
// Gateway singleton
// ---------------------------------------------------------------------------

let _gateway: DiscordGateway | null = null;
let _botUserId: string | null = null;

export function setGateway(gateway: DiscordGateway): void {
  _gateway = gateway;
}

export function setBotUserId(id: string): void {
  _botUserId = id;
}

export function getBotUserId(): string | null {
  return _botUserId;
}

export function getClient(): DiscordGateway | null {
  return _gateway;
}

/**
 * Query the Discord gateway for the voice channel a user currently occupies,
 * or null if the user isn't in a voice channel.
 */
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

async function tryCompleteVoiceConnection(guildId: string): Promise<void> {
  const pending = pendingVoiceConnections.get(guildId);
  if (!pending) {
    return;
  }
  if (!pending.sessionId || !pending.token || !pending.endpoint) {
    return;
  }

  const sessionId = lavalink.getSessionId();
  if (!sessionId) {
    // Lavalink WebSocket hasn't received its 'ready' event yet.
    // Retry in 200ms — the connection was just initiated.
    setTimeout(() => {
      void tryCompleteVoiceConnection(guildId);
    }, 200);
    return;
  }

  pendingVoiceConnections.delete(guildId);

  try {
    await updateNodeLinkPlayer(guildId, sessionId, {
      voice: {
        token: pending.token,
        endpoint: pending.endpoint,
        sessionId: pending.sessionId,
      },
    });
    lavalink.markConnected(guildId, true);
    pending.resolve();
  } catch (err) {
    pending.reject(err as Error);
  }
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

/**
 * Called from handleVoiceStateUpdate when the bot's own voice session ID arrives.
 */
export function completePendingConnection(guildId: string, sessionId: string): void {
  const pending = pendingVoiceConnections.get(guildId);
  if (pending) {
    pending.sessionId = sessionId;
    void tryCompleteVoiceConnection(guildId);
  }
}

/**
 * Called from handleVoiceServerUpdate when voice server data arrives.
 */
export function setPendingConnectionDetails(
  guildId: string,
  token: string,
  endpoint: string
): void {
  const pending = pendingVoiceConnections.get(guildId);
  if (pending) {
    pending.token = token;
    pending.endpoint = endpoint;
    void tryCompleteVoiceConnection(guildId);
  }
}
