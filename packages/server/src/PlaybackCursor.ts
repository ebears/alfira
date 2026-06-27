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
   * Clear all items from the buffer.
   */
  clear(): void {
    this.buffer = [];
    this.readIndex = 0;
    this.playbackOrder = null;
  }

  // ---------------------------------------------------------------------------
  // Utility Operations
  // ---------------------------------------------------------------------------

  /**
   * Convert remaining items after the current one to an array.
   * Excludes the item at the current read position (for "queue" display
   * that should not include the currently-playing song).
   */
  toRemaining(): T[] {
    const result: T[] = [];
    for (let i = this.readIndex + 1; i < this.buffer.length; i++) {
      const idx = this.playbackOrder?.[i] ?? i;
      // idx is always valid since i < this.buffer.length and playbackOrder contains valid indices
      result.push(this.buffer[idx]!);
    }
    return result;
  }
}
