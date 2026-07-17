import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// useSocket
//
// Returns a shared WebSocket connection. A module-level singleton is used
// deliberately — there should only ever be one WebSocket connection for the
// whole app, and a per-hook instance causes issues with reconnection logic.
//
// Bun's native WebSocket has no built-in reconnection, so we implement
// exponential backoff manually.
// ---------------------------------------------------------------------------

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

let ws: WebSocket | null = null;
let connectionStatus: ConnectionStatus = 'disconnected';
let reconnectAttempt = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal storage holds callbacks of varying types
const eventListeners = new Map<string, Set<(...args: any[]) => void>>();
const statusListeners = new Set<() => void>();

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

function setStatus(status: ConnectionStatus) {
  if (connectionStatus !== status) {
    connectionStatus = status;
    for (const listener of statusListeners) listener();
  }
}

function scheduleReconnect() {
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
  reconnectAttempt++;
  setStatus('reconnecting');
  setTimeout(() => {
    connect();
  }, delay);
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.addEventListener('open', () => {
    setStatus('connected');
    reconnectAttempt = 0;
  });

  ws.addEventListener('close', () => {
    setStatus('disconnected');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    // error always precedes close, so we just let close handle reconnect
  });

  ws.addEventListener('message', (event) => {
    try {
      const { event: eventName, data } = JSON.parse(event.data as string) as {
        event: string;
        data: unknown;
      };
      const listeners = eventListeners.get(eventName);
      if (listeners) {
        for (const callback of listeners) {
          callback(data);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function getStatus() {
  return connectionStatus;
}

export function useSocket(): WebSocket {
  if (!ws) {
    connect();
  }
  return ws as WebSocket;
}

export function useConnectionStatus(): ConnectionStatus {
  useSocket();
  return useSyncExternalStore(subscribeStatus, getStatus, getStatus);
}

export function disposeSocket(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// ---------------------------------------------------------------------------
// Event registration (mirrors the native WebSocket event API)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- must return Set to hold varying callback types
function ensureListeners(event: string): Set<(...args: any[]) => void> {
  let listeners = eventListeners.get(event);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(event, listeners);
  }
  return listeners;
}

/**
 * Register a callback for a WebSocket event.
 * Events: 'player:update', 'playlists:updated', 'songs:added', 'songs:deleted', 'songs:updated'
 */
export function onSocketEvent<T>(event: string, callback: (data: T) => void): () => void {
  const listeners = ensureListeners(event);
  listeners.add(callback);
  return () => listeners.delete(callback);
}
