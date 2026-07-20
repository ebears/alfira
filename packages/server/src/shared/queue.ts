import { type QueuedSong, type Song } from './types';

/**
 * Converts a Song (database record) into a QueuedSong by attaching the
 * Discord member's display name as `requestedBy`.
 *
 * This is used at queue-time to preserve who added the song to the queue.
 */
export function toQueuedSong(song: Song, requestedBy: string): QueuedSong {
  return {
    ...song,
    requestedBy,
  };
}
