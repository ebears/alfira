import { eq } from 'drizzle-orm';
import type { CompressorSettings, Playlist, QueueState, User } from '../shared';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';

import { formatSong, type SerializedSong } from './serialization';

// Accept both Date and string createdAt — Drizzle uses Date at the DB level,
// but we serialize to ISO string for JSON serialization.
type SerializedPlaylist = Omit<Playlist, 'createdAt'> & { createdAt: string | Date };

// ---------------------------------------------------------------------------
// WebSocket client registry
// ---------------------------------------------------------------------------

export interface WsClient {
  readonly id: number;
  send(data: string): void;
  close(): void;
}

const clients = new Set<WsClient>();

export function getCompressorSettings(): CompressorSettings | null {
  const row = db
    .select({
      enabled: tables.guildSettings.compressorEnabled,
      threshold: tables.guildSettings.compressorThreshold,
      ratio: tables.guildSettings.compressorRatio,
      attack: tables.guildSettings.compressorAttack,
      release: tables.guildSettings.compressorRelease,
      gain: tables.guildSettings.compressorGain,
    })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();
  if (!row) return null;
  return {
    enabled: row.enabled,
    threshold: row.threshold,
    ratio: row.ratio,
    attack: row.attack,
    release: row.release,
    gain: row.gain,
  };
}

/**
 * Registers a newly connected WebSocket client after auth in fetch().
 */
export function registerClient(ws: WsClient, user: User): void {
  clients.add(ws);
  logger.info({ socketId: ws.id, username: user.username }, 'WebSocket client connected');
}

/**
 * Removes a disconnected WebSocket client.
 */
export function unregisterClient(ws: WsClient): void {
  clients.delete(ws);
  logger.info({ socketId: ws.id }, 'WebSocket client disconnected');
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/**
 * Emit the full queue state to all connected clients.
 */
export function emitPlayerUpdate(state: QueueState): void {
  const compressor = getCompressorSettings();
  const message = JSON.stringify({
    event: 'player:update',
    data: { ...state, compressorSettings: compressor },
  });
  for (const client of clients) {
    client.send(message);
  }
}

/**
 * Emit a newly added song to all connected clients.
 */
export function emitSongAdded(song: SerializedSong): void {
  const payload = formatSong(song);
  const message = JSON.stringify({ event: 'songs:added', data: payload });
  for (const client of clients) {
    client.send(message);
  }
}

/**
 * Emit the deleted song's ID to all connected clients.
 */
export function emitSongDeleted(id: string): void {
  const message = JSON.stringify({ event: 'songs:deleted', data: id });
  for (const client of clients) {
    client.send(message);
  }
}

/**
 * Emit an updated song to all connected clients.
 */
export function emitSongUpdated(song: SerializedSong): void {
  const payload = formatSong(song);
  const message = JSON.stringify({ event: 'songs:updated', data: payload });
  for (const client of clients) {
    client.send(message);
  }
}

/**
 * Emit an updated playlist object to all connected clients.
 * Covers: create, rename, song added, song removed.
 */
export function emitPlaylistUpdated(playlist: SerializedPlaylist): void {
  const message = JSON.stringify({ event: 'playlists:updated', data: playlist });
  for (const client of clients) {
    client.send(message);
  }
}

/**
 * Close all connected WebSocket clients gracefully.
 */
export function closeAllClients(): void {
  for (const client of clients) {
    client.close();
  }
  clients.clear();
}
