import { logger } from '../shared/logger';

// ---------------------------------------------------------------------------
// Custom Discord Gateway client — replaces the Seyfert Client gateway surface.
//
// Handles: WebSocket connect, identify, heartbeat, reconnect, and event
// dispatch. Only the opcodes and event types Alfira actually uses are
// implemented (dispatch, heartbeat, reconnect, invalid session, hello).
// ---------------------------------------------------------------------------

// Discord gateway opcodes we handle.
const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RESUME = 6;
const OP_RECONNECT = 7;
const OP_INVALID_SESSION = 9;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GatewayHello {
  op: 10;
  d: { heartbeat_interval: number };
  s: null;
  t: null;
}

interface GatewayDispatch {
  op: 0;
  d: unknown;
  s: number;
  t: string;
}

interface GatewayInvalidSession {
  op: 9;
  d: boolean;
}

type DispatchHandler = (eventName: string, data: unknown) => void;

// ---------------------------------------------------------------------------
// Gateway client
// ---------------------------------------------------------------------------

export class DiscordGateway {
  private ws: WebSocket | null = null;
  private token: string;
  private intents: number;
  private handlers: DispatchHandler[] = [];

  // Session state for resume.
  private sessionId: string | null = null;
  private lastSeq: number | null = null;
  private resumeGatewayUrl: string | null = null;

  // Deferred resolution for start() — resolves on first READY.
  private readyResolve: (() => void) | null = null;

  // Heartbeat.
  private heartbeatInterval: number | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAck = true;

  // Reconnect backoff.
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  // Identify timeout.
  private identifyTimeout: ReturnType<typeof setTimeout> | null = null;

  // Voice state tracking (for voice.ts lookups).
  // Map of userId -> channelId.
  private voiceStates = new Map<string, string>();

  constructor(token: string, intents: number) {
    this.token = token;
    this.intents = intents;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Register a handler for dispatch events. */
  onDispatch(handler: DispatchHandler): void {
    this.handlers.push(handler);
  }

  /** Send a raw gateway payload (e.g., op 4 VOICE_STATE_UPDATE). */
  send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Gateway send called but socket is not open');
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  /**
   * Start the gateway connection. Resolves when READY fires for the first
   * time. Subsequent reconnects are handled internally and do not affect
   * the returned promise.
   */
  start(): Promise<void> {
    this.shouldReconnect = true;
    return new Promise<void>((resolve) => {
      this.readyResolve = resolve;
      this.connect();
    });
  }

  /** Graceful shutdown — close the socket and don't reconnect. */
  destroy(): void {
    this.shouldReconnect = false;
    this.readyResolve = null;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close(1000);
      this.ws = null;
    }
  }

  /** Look up a user's current voice channel from tracked gateway state. */
  getUserVoiceChannel(userId: string): string | null {
    return this.voiceStates.get(userId) ?? null;
  }

  /** Check if the gateway is connected and ready. */
  isReady(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  /** Open a WebSocket and begin the identify/resume flow. */
  private connect(): void {
    this.clearTimers();

    const url = this.resumeGatewayUrl ?? GATEWAY_URL;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'WebSocket constructor failed'
      );
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    this.lastHeartbeatAck = true;

    ws.onopen = (): void => {
      // If we have a valid session, try resume instead of identify.
      if (this.sessionId && this.lastSeq !== null) {
        logger.info('Gateway connected, sending resume');
        ws.send(
          JSON.stringify({
            op: OP_RESUME,
            d: {
              token: this.token,
              session_id: this.sessionId,
              seq: this.lastSeq,
            },
          })
        );
      }
      // Identify will be sent after hello if resume wasn't attempted.
    };

    ws.onmessage = (event: MessageEvent): void => {
      let msg: { op: number; d: unknown; s: number | null; t: string | null };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // Track sequence number for resume.
      if (msg.s !== null && msg.s !== undefined) {
        this.lastSeq = msg.s;
      }

      switch (msg.op) {
        case OP_HELLO: {
          const hello = msg as GatewayHello;
          this.startHeartbeat(hello.d.heartbeat_interval);

          // If we didn't send resume (no session), send identify.
          if (!this.sessionId) {
            this.sendIdentify();
            // Set a timeout — if we don't get READY within 30s, reconnect.
            this.identifyTimeout = setTimeout(() => {
              logger.error('Identify timed out — no READY within 30s');
              this.forceReconnect();
            }, 30_000);
          }
          break;
        }

        case OP_DISPATCH: {
          const dispatch = msg as GatewayDispatch;

          // Handle READY for session init.
          if (dispatch.t === 'READY') {
            const ready = dispatch.d as {
              session_id: string;
              resume_gateway_url: string;
              user: { id: string; username: string };
            };
            this.sessionId = ready.session_id;
            this.resumeGatewayUrl = ready.resume_gateway_url;
            this.reconnectAttempts = 0;

            if (this.identifyTimeout) {
              clearTimeout(this.identifyTimeout);
              this.identifyTimeout = null;
            }

            // Dispatch READY to handlers first so botUserId is set,
            // then resolve the start() promise.
            for (const handler of this.handlers) {
              handler(dispatch.t, dispatch.d);
            }

            if (this.readyResolve) {
              this.readyResolve();
              this.readyResolve = null;
            }
            return;
          }

          // Handle RESUMED.
          if (dispatch.t === 'RESUMED') {
            logger.info('Gateway session resumed');
            this.reconnectAttempts = 0;

            if (this.readyResolve) {
              this.readyResolve();
              this.readyResolve = null;
            }
            return;
          }

          // Track voice states from VOICE_STATE_UPDATE for REST-free lookups.
          if (dispatch.t === 'VOICE_STATE_UPDATE') {
            const d = dispatch.d as {
              user_id: string;
              channel_id: string | null;
            };
            if (d.channel_id) {
              this.voiceStates.set(d.user_id, d.channel_id);
            } else {
              this.voiceStates.delete(d.user_id);
            }
          }

          // Dispatch to registered handlers.
          for (const handler of this.handlers) {
            handler(dispatch.t, dispatch.d);
          }
          break;
        }

        case OP_HEARTBEAT:
          // Discord requests a heartbeat — respond immediately.
          ws.send(JSON.stringify({ op: OP_HEARTBEAT, d: this.lastSeq }));
          break;

        case OP_HEARTBEAT_ACK:
          this.lastHeartbeatAck = true;
          break;

        case OP_RECONNECT:
          logger.info('Gateway requested reconnect (op 7)');
          this.forceReconnect();
          break;

        case OP_INVALID_SESSION: {
          const invalid = msg as GatewayInvalidSession;
          logger.warn({ resumable: invalid.d }, 'Invalid session');
          this.sessionId = null;
          this.lastSeq = null;
          if (invalid.d) {
            // Resumable — wait a moment then re-identify.
            setTimeout(() => {
              if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendIdentify();
              }
            }, 2000);
          } else {
            // Not resumable — full reconnect.
            this.forceReconnect();
          }
          break;
        }
      }
    };

    ws.onclose = (event: CloseEvent): void => {
      logger.warn({ code: event.code, reason: event.reason }, 'Gateway WebSocket closed');
      this.clearTimers();
      this.ws = null;

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = (): void => {
      // onclose will fire after this — reconnect handled there.
    };
  }

  private sendIdentify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        op: OP_IDENTIFY,
        d: {
          token: this.token,
          intents: this.intents,
          properties: {
            os: 'linux',
            browser: 'alfira',
            device: 'alfira',
          },
        },
      })
    );
  }

  // -----------------------------------------------------------------------
  // Heartbeat
  // -----------------------------------------------------------------------

  private startHeartbeat(interval: number): void {
    this.clearHeartbeat();
    this.heartbeatInterval = interval;
    this.lastHeartbeatAck = true;

    // Discord recommends sending the first heartbeat after interval * jitter.
    const jitter = Math.random();
    const firstDelay = interval * jitter;

    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat();
      // Then every interval.
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
      }, interval);
    }, firstDelay);
  }

  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // If the last heartbeat wasn't acked, connection is zombie — force reconnect.
    if (!this.lastHeartbeatAck) {
      logger.error('Heartbeat not acknowledged — forcing reconnect');
      this.forceReconnect();
      return;
    }

    this.lastHeartbeatAck = false;
    this.ws.send(JSON.stringify({ op: OP_HEARTBEAT, d: this.lastSeq }));
  }

  // -----------------------------------------------------------------------
  // Reconnect
  // -----------------------------------------------------------------------

  private scheduleReconnect(): void {
    const baseDelay = 1000;
    const maxDelay = 30_000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), maxDelay);
    this.reconnectAttempts++;

    logger.info({ delay, attempt: this.reconnectAttempts }, 'Scheduling gateway reconnect');
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private forceReconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000);
      this.ws = null;
    }
    this.clearTimers();
    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.identifyTimeout) {
      clearTimeout(this.identifyTimeout);
      this.identifyTimeout = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatInterval = null;
  }
}
