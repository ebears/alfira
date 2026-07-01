import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

import { logger } from '../shared/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrackEndReason = 'finished' | 'loadFailed' | 'stopped' | 'replaced' | 'cleanup';

interface LavalinkReady {
  op: 'ready';
  resumed: boolean;
  sessionId: string;
}

interface LavalinkPlayerUpdate {
  op: 'playerUpdate';
  guildId: string;
  state: {
    connected: boolean;
    ping: number;
    position: number;
    time: number;
  };
}

interface LavalinkEvent {
  op: 'event';
  type: string;
  guildId: string;
}

interface LavalinkTrackStartEvent extends LavalinkEvent {
  type: 'TrackStartEvent';
  track: string;
}

interface LavalinkTrackEndEvent extends LavalinkEvent {
  type: 'TrackEndEvent';
  track: string;
  reason: TrackEndReason;
}

interface LavalinkTrackExceptionEvent extends LavalinkEvent {
  type: 'TrackExceptionEvent';
  track: string;
  exception: {
    message: string;
    severity: string;
    cause: string;
  };
}

interface LavalinkWebSocketClosedEvent extends LavalinkEvent {
  type: 'WebSocketClosedEvent';
  code: number;
  reason: string;
  byRemote: boolean;
}

type LavalinkMessage =
  | LavalinkReady
  | LavalinkPlayerUpdate
  | LavalinkTrackStartEvent
  | LavalinkTrackEndEvent
  | LavalinkTrackExceptionEvent
  | LavalinkWebSocketClosedEvent;

// ---------------------------------------------------------------------------
// Event emitter helpers
// ---------------------------------------------------------------------------

interface LavalinkEvents {
  trackEnd: [guildId: string, reason: TrackEndReason];
  trackError: [guildId: string, exception: { message?: string }];
  socketClosed: [guildId: string, code: number, reason: string, byRemote: boolean];
}

// ---------------------------------------------------------------------------
// Guild state tracking
// ---------------------------------------------------------------------------

interface GuildState {
  connected: boolean;
  playing: boolean;
}

// ---------------------------------------------------------------------------
// LavalinkSocket
// ---------------------------------------------------------------------------

class LavalinkSocket extends EventEmitter<LavalinkEvents> {
  private ws: WebSocket | null = null;
  private _sessionId: string | null = null;
  private url = '';
  private auth = '';
  private _userId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;

  private readonly guilds = new Map<string, GuildState>();

  private _connectPromise: Promise<void> | null = null;
  private _connectResolve: (() => void) | null = null;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  connect(url: string, auth: string, userId?: string): Promise<void> {
    this.url = url;
    this.auth = auth;
    this._userId = userId ?? null;
    this.intentionalClose = false;
    this._connectPromise = new Promise<void>((resolve) => {
      this._connectResolve = resolve;
    });

    this._doConnect();
    return this._connectPromise;
  }

  private _doConnect(): void {
    logger.info({ url: this.url }, 'Lavalink: attempting WebSocket connection');

    const headers: Record<string, string> = {};
    if (this.auth) headers.Authorization = this.auth;
    if (this._userId) headers['User-Id'] = this._userId;
    headers['Client-Name'] = 'Alfira';

    const ws = new WebSocket(this.url, { headers });
    this.ws = ws;

    ws.on('open', () => {
      logger.info({ url: this.url }, 'Lavalink WebSocket open');
      this.reconnectAttempt = 0;
    });

    ws.on('message', (data: Buffer) => {
      let msg: LavalinkMessage;
      try {
        msg = JSON.parse(data.toString()) as LavalinkMessage;
      } catch {
        logger.warn({ raw: data.toString().slice(0, 200) }, 'Lavalink: unparseable message');
        return;
      }
      this.dispatch(msg);
    });

    ws.on('close', (code: number) => {
      logger.warn({ code }, 'Lavalink WebSocket closed');
      this.ws = null;
      this._sessionId = null;

      for (const state of this.guilds.values()) {
        state.connected = false;
        state.playing = false;
      }

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    ws.on('error', (err: Error) => {
      logger.error({ err }, 'Lavalink WebSocket error');
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._sessionId = null;
    this.guilds.clear();
  }

  getSessionId(): string | null {
    return this._sessionId;
  }

  isGuildConnected(guildId: string): boolean {
    return this.guilds.get(guildId)?.connected ?? false;
  }

  markConnected(guildId: string, connected: boolean): void {
    this.ensureGuild(guildId).connected = connected;
  }

  isGuildPlaying(guildId: string): boolean {
    return this.guilds.get(guildId)?.playing ?? false;
  }

  /** Force-reset playing state — used when destroying a player. */
  markPlaying(guildId: string, playing: boolean): void {
    this.ensureGuild(guildId).playing = playing;
  }

  onTrackEnd(guildId: string, handler: (reason: TrackEndReason) => void): () => void {
    const wrapped = (gid: string, reason: TrackEndReason) => {
      if (gid === guildId) handler(reason);
    };
    this.on('trackEnd', wrapped);
    return () => this.off('trackEnd', wrapped);
  }

  onTrackError(guildId: string, handler: (exception: { message?: string }) => void): () => void {
    const wrapped = (gid: string, exception: { message?: string }) => {
      if (gid === guildId) handler(exception);
    };
    this.on('trackError', wrapped);
    return () => this.off('trackError', wrapped);
  }

  onSocketClosed(
    guildId: string,
    handler: (code: number, reason: string, byRemote: boolean) => void
  ): () => void {
    const wrapped = (gid: string, code: number, reason: string, byRemote: boolean) => {
      if (gid === guildId) handler(code, reason, byRemote);
    };
    this.on('socketClosed', wrapped);
    return () => this.off('socketClosed', wrapped);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private ensureGuild(guildId: string): GuildState {
    let state = this.guilds.get(guildId);
    if (!state) {
      state = { connected: false, playing: false };
      this.guilds.set(guildId, state);
    }
    return state;
  }

  private dispatch(msg: LavalinkMessage): void {
    switch (msg.op) {
      case 'ready': {
        this._sessionId = msg.sessionId;
        logger.info({ sessionId: msg.sessionId, resumed: msg.resumed }, 'Lavalink ready');
        this._connectResolve?.();
        this._connectResolve = null;
        break;
      }

      case 'playerUpdate': {
        const state = this.ensureGuild(msg.guildId);
        state.connected = msg.state.connected;
        break;
      }

      case 'event': {
        switch (msg.type) {
          case 'TrackStartEvent':
            this.ensureGuild(msg.guildId).playing = true;
            break;

          case 'TrackEndEvent': {
            const gs = this.ensureGuild(msg.guildId);
            gs.playing = false;
            this.emit('trackEnd', msg.guildId, msg.reason);
            break;
          }

          case 'TrackExceptionEvent': {
            const gs2 = this.ensureGuild(msg.guildId);
            gs2.playing = false;
            this.emit('trackError', msg.guildId, msg.exception);
            break;
          }

          case 'WebSocketClosedEvent': {
            const gs3 = this.ensureGuild(msg.guildId);
            gs3.connected = false;
            gs3.playing = false;
            this.emit('socketClosed', msg.guildId, msg.code, msg.reason, msg.byRemote);
            break;
          }

          default: {
            const evt = msg as LavalinkEvent;
            logger.debug({ type: evt.type, guildId: evt.guildId }, 'Lavalink: unhandled event');
            break;
          }
        }
        break;
      }

      default:
        logger.debug({ op: (msg as { op: string }).op }, 'Lavalink: unhandled opcode');
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;

    const baseDelay = 1_000;
    const maxDelay = 30_000;
    const delay = Math.min(baseDelay * 2 ** this.reconnectAttempt, maxDelay);
    this.reconnectAttempt++;

    logger.info({ delay, attempt: this.reconnectAttempt }, 'Lavalink: scheduling reconnect');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info({ attempt: this.reconnectAttempt }, 'Lavalink: reconnecting');
      this._doConnect();
    }, delay);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const lavalink = new LavalinkSocket();
