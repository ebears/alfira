import { fisherYatesShuffle } from './shared';

// ---------------------------------------------------------------------------
// PlaybackCursor
//
// A playback cursor over a fixed set of items with loop support.
// Uses a read pointer that can wrap around for queue loop mode, and supports
// shuffle via a separate playback order index array.
// ---------------------------------------------------------------------------

export class PlaybackCursor<T> {
  private buffer: T[];
  private readIndex = 0;
  private playbackOrder: number[] | null = null;

  constructor(items: T[] = []) {
    this.buffer = [...items];
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /** Whether the buffer is empty */
  get isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /** Whether we've reached the end of the buffer */
  get isAtEnd(): boolean {
    return this.readIndex >= this.buffer.length;
  }

  /** Whether the queue is currently shuffled */
  get isShuffled(): boolean {
    return this.playbackOrder !== null;
  }

  // ---------------------------------------------------------------------------
  // Core Operations
  // ---------------------------------------------------------------------------

  /**
   * Get the current item without advancing the read pointer.
   * Returns undefined if buffer is empty or at end.
   */
  current(): T | undefined {
    if (this.buffer.length === 0 || this.isAtEnd) {
      return undefined;
    }

    const idx = this.playbackOrder?.[this.readIndex] ?? this.readIndex;
    return this.buffer[idx];
  }

  /**
   * Advance the read pointer to the next item.
   * Does nothing if already at end.
   */
  advance(): void {
    if (!this.isAtEnd) {
      this.readIndex++;
    }
  }

  /**
   * Reset the read pointer to the beginning.
   * Used for queue loop mode to wrap around.
   */
  reset(): void {
    this.readIndex = 0;
  }

  // ---------------------------------------------------------------------------
  // Shuffle Operations
  // ---------------------------------------------------------------------------

  /**
   * Shuffle the playback order using Fisher-Yates algorithm.
   * The buffer contents remain unchanged; only the access order is randomized.
   * Only shuffles unplayed items (after current position), keeping already-played
   * items in their original order. Preserves the current read position.
   */
  shuffle(): void {
    if (this.buffer.length <= 1) {
      return;
    }

    // Keep played items in original order (if any)
    const played = Array.from({ length: this.readIndex }, (_, i) => i);

    // Create array of remaining indices to shuffle
    const remaining = Array.from(
      { length: this.buffer.length - this.readIndex },
      (_, i) => this.readIndex + i
    );

    // Fisher-Yates shuffle only the remaining items
    fisherYatesShuffle(remaining);

    this.playbackOrder = [...played, ...remaining];
  }

  /**
   * Restore original buffer order by clearing the playback order.
   * The buffer itself is already in canonical order, so this just removes
   * the shuffled index array.
   */
  unshuffle(): void {
    this.playbackOrder = null;
  }

  // ---------------------------------------------------------------------------
  // Modification Operations
  // ---------------------------------------------------------------------------

  /**
   * Replace the entire buffer contents with new items.
   * Resets read pointer and clears shuffle.
   */
  replace(items: T[]): void {
    this.buffer = [...items];
    this.readIndex = 0;
    this.playbackOrder = null;
  }

  /**
   * Append items to the end of the buffer without affecting the read position.
   * This is useful for adding songs to a queue that's currently being played.
   *
   * If the buffer is shuffled, new items are added to the end of the playback order,
   * ensuring they play after all existing items.
   */
  append(...items: T[]): void {
    if (items.length === 0) return;

    const startIndex = this.buffer.length;
    this.buffer.push(...items);

    // If shuffled, add new indices to the end of playbackOrder
    if (this.playbackOrder !== null) {
      for (let i = 0; i < items.length; i++) {
        this.playbackOrder.push(startIndex + i);
      }
    }
  }

  /**
   * Insert an item at the front of the unplayed portion (at readIndex),
   * so it plays before all currently-remaining items. Unshuffles.
   */
  insertAtFront(item: T): void {
    this.buffer.splice(this.readIndex, 0, item);
    // Manual insertion supersedes any shuffle order
    this.playbackOrder = null;
  }

  /**
   * Clear all items from the buffer.
   */
  clear(): void {
    this.buffer = [];
    this.readIndex = 0;
    this.playbackOrder = null;
  }

  /**
   * Remove all items matching the predicate from the buffer.
   * Correctly adjusts readIndex and playbackOrder so the queue
   * remains consistent after removal, preserving shuffle state.
   * Returns the removed items.
   */
  removeWhere(predicate: (item: T) => boolean): T[] {
    const removed: T[] = [];
    const newBuffer: T[] = [];
    const oldToNewIndex = new Map<number, number>();

    for (let i = 0; i < this.buffer.length; i++) {
      const item = this.buffer[i];
      if (item === undefined) continue;
      if (predicate(item)) {
        removed.push(item);
      } else {
        oldToNewIndex.set(i, newBuffer.length);
        newBuffer.push(item);
      }
    }

    if (removed.length === 0) return [];

    // Adjust readIndex: count removed items before it
    let removedBefore = 0;
    for (let i = 0; i < this.readIndex; i++) {
      if (!oldToNewIndex.has(i)) removedBefore++;
    }
    this.readIndex = Math.max(0, this.readIndex - removedBefore);

    // Remap playbackOrder indices to the compacted buffer
    if (this.playbackOrder !== null) {
      const newPlaybackOrder: number[] = [];
      for (const oldIdx of this.playbackOrder) {
        const newIdx = oldToNewIndex.get(oldIdx);
        if (newIdx !== undefined) {
          newPlaybackOrder.push(newIdx);
        }
      }
      this.playbackOrder = newPlaybackOrder;
      // If the order array is now empty (all items removed), clean up
      if (this.playbackOrder.length === 0) {
        this.playbackOrder = null;
      }
    }

    this.buffer = newBuffer;
    return removed;
  }

  /**
   * Replace the unplayed portion of the buffer with the given items
   * in the new order. Unshuffles (manual reorder supersedes shuffle).
   * The orderedItems array must contain exactly the same elements as
   * the current remaining items, matched by the provided equality function.
   */
  reorderRemaining(orderedItems: T[], matchFn: (a: T, b: T) => boolean): void {
    const remaining = this.toRemaining();

    if (orderedItems.length !== remaining.length) {
      throw new Error('Reorder must preserve all items');
    }

    // Verify all items are present
    for (const item of orderedItems) {
      if (!remaining.some((r) => matchFn(r, item))) {
        throw new Error('Reorder contains unknown item');
      }
    }

    // Replace the unplayed portion
    const played = this.buffer.slice(0, this.readIndex);
    this.buffer = [...played, ...orderedItems];
    this.playbackOrder = null;
  }

  // ---------------------------------------------------------------------------
  // Utility Operations
  // ---------------------------------------------------------------------------

  /**
   * Update all items matching the predicate in-place. Returns the number
   * of items updated.  Modifies buffer entries directly — does not affect
   * readIndex or playbackOrder.
   */
  updateWhere(predicate: (item: T) => boolean, updater: (item: T) => T): number {
    let count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const item = this.buffer[i];
      if (item !== undefined && predicate(item)) {
        this.buffer[i] = updater(item);
        count++;
      }
    }
    return count;
  }

  /**
   * Convert all unplayed items to an array for the queue display.
   *
   * After advance(), readIndex points to the next song to be played
   * (not the currently-playing one). We start from readIndex to
   * include all songs that haven't been played yet.
   */
  toRemaining(): T[] {
    const result: T[] = [];
    for (let i = this.readIndex; i < this.buffer.length; i++) {
      const idx = this.playbackOrder?.[i] ?? i;
      // idx is always valid since i < this.buffer.length and playbackOrder contains valid indices
      const item = this.buffer[idx];
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }
}
