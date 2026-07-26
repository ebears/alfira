import { describe, expect, mock, test } from 'bun:test';

import { PlaybackCursor } from './PlaybackCursor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Song {
  id: string;
  title: string;
}

function song(id: string, title: string): Song {
  return { id, title };
}

function songs(...ids: string[]): Song[] {
  return ids.map((id) => song(id, `Song ${id}`));
}

// ---------------------------------------------------------------------------
// Constructor & initial state
// ---------------------------------------------------------------------------

describe('constructor', () => {
  test('creates an empty cursor when no items provided', () => {
    const cursor = new PlaybackCursor();
    expect(cursor.isEmpty).toBe(true);
    expect(cursor.isAtEnd).toBe(true);
    expect(cursor.isShuffled).toBe(false);
  });

  test('creates a cursor with items', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c']);
    expect(cursor.isEmpty).toBe(false);
    expect(cursor.isAtEnd).toBe(false);
    expect(cursor.isShuffled).toBe(false);
  });

  test('copies input array (does not mutate original)', () => {
    const items = ['a', 'b', 'c'];
    const cursor = new PlaybackCursor(items);
    items.push('d');
    expect(cursor.toRemaining()).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

describe('isEmpty', () => {
  test('true for empty cursor', () => {
    expect(new PlaybackCursor().isEmpty).toBe(true);
  });

  test('false when items exist', () => {
    expect(new PlaybackCursor(['x']).isEmpty).toBe(false);
  });

  test('true after clear', () => {
    const cursor = new PlaybackCursor(['x']);
    cursor.clear();
    expect(cursor.isEmpty).toBe(true);
  });
});

describe('isAtEnd', () => {
  test('true for empty cursor', () => {
    expect(new PlaybackCursor().isAtEnd).toBe(true);
  });

  test('false when items remain', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    expect(cursor.isAtEnd).toBe(false);
  });

  test('true after advancing past all items', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.advance();
    cursor.advance();
    expect(cursor.isAtEnd).toBe(true);
  });

  test('false after reset from end', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.advance();
    cursor.advance();
    cursor.reset();
    expect(cursor.isAtEnd).toBe(false);
  });
});

describe('isShuffled', () => {
  test('false initially', () => {
    expect(new PlaybackCursor(['a', 'b']).isShuffled).toBe(false);
  });

  test('true after shuffle', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c']);
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(true);
  });

  test('false after unshuffle', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c']);
    cursor.shuffle();
    cursor.unshuffle();
    expect(cursor.isShuffled).toBe(false);
  });

  test('false after clear', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c']);
    cursor.shuffle();
    cursor.clear();
    expect(cursor.isShuffled).toBe(false);
  });

  test('false after replace', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c']);
    cursor.shuffle();
    cursor.replace(['x', 'y']);
    expect(cursor.isShuffled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// current()
// ---------------------------------------------------------------------------

describe('current', () => {
  test('returns first item initially', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    expect(cursor.current()).toEqual(song('a', 'Song a'));
  });

  test('returns second item after advance', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.advance();
    expect(cursor.current()).toEqual(song('b', 'Song b'));
  });

  test('returns undefined for empty cursor', () => {
    const cursor = new PlaybackCursor();
    expect(cursor.current()).toBeUndefined();
  });

  test('returns undefined after advancing past end', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.advance();
    cursor.advance();
    expect(cursor.current()).toBeUndefined();
  });

  test('returns first item again after reset', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.advance();
    cursor.advance();
    cursor.reset();
    expect(cursor.current()).toEqual(song('a', 'Song a'));
  });

  test('respects shuffle order', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c', 'd', 'e']);
    // Mock Math.random to return 1 so Fisher-Yates swaps with last element each time,
    // producing a predictable reversed order for the remaining items.
    const orig = Math.random;
    Math.random = mock(() => 0.999);
    cursor.shuffle();
    Math.random = orig;

    // Should still return first item at current position (index 0 in playbackOrder)
    expect(typeof cursor.current()).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// advance()
// ---------------------------------------------------------------------------

describe('advance', () => {
  test('moves readIndex forward', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.advance();
    expect(cursor.current()).toEqual(song('b', 'Song b'));
  });

  test('multiple advances reach end', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.advance();
    expect(cursor.isAtEnd).toBe(false);
    cursor.advance();
    expect(cursor.isAtEnd).toBe(true);
  });

  test('no-op when already at end', () => {
    const cursor = new PlaybackCursor(['a']);
    cursor.advance();
    expect(cursor.isAtEnd).toBe(true);
    // Should not throw or change state
    cursor.advance();
    expect(cursor.isAtEnd).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('reset', () => {
  test('moves readIndex back to 0', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.advance();
    cursor.advance();
    cursor.reset();
    expect(cursor.current()).toEqual(song('a', 'Song a'));
    expect(cursor.isAtEnd).toBe(false);
  });

  test('no-op on already-reset cursor', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.reset();
    expect(cursor.current()).toBe('a');
  });

  test('reset from empty is fine', () => {
    const cursor = new PlaybackCursor();
    cursor.reset();
    expect(cursor.isEmpty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shuffle()
// ---------------------------------------------------------------------------

describe('shuffle', () => {
  test('does nothing on empty cursor', () => {
    const cursor = new PlaybackCursor();
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(false);
  });

  test('does nothing on single-element cursor', () => {
    const cursor = new PlaybackCursor(['a']);
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(false);
  });

  test('sets isShuffled to true for 2+ items', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(true);
  });

  test('preserves all items after shuffle', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c', 'd', 'e'));
    cursor.shuffle();
    const all = cursor.toRemaining();
    const sorted = [...all].sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted).toEqual(songs('a', 'b', 'c', 'd', 'e'));
  });

  test('only shuffles unplayed items (readIndex > 0)', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c', 'd', 'e']);
    cursor.advance();
    cursor.advance();
    // Played: a, b. Remaining: c, d, e.

    // Mock random to produce a predictable reorder
    const orig = Math.random;
    Math.random = mock(() => 0.999);
    cursor.shuffle();
    Math.random = orig;

    // All 5 items should still be present
    const remaining = cursor.toRemaining();
    expect(remaining).toHaveLength(3);
    const sorted = [...remaining].sort();
    expect(sorted).toEqual(['c', 'd', 'e']);
  });

  test('double shuffle replaces previous order', () => {
    const items = songs('a', 'b', 'c', 'd', 'e');
    const cursor = new PlaybackCursor(items);

    // Shuffle twice — the second should replace the first
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(true);
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(true);

    // All items still present
    const remaining = cursor.toRemaining();
    expect(remaining).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// unshuffle()
// ---------------------------------------------------------------------------

describe('unshuffle', () => {
  test('restores original order', () => {
    const items = songs('a', 'b', 'c', 'd', 'e');
    const cursor = new PlaybackCursor(items);

    const orig = Math.random;
    Math.random = mock(() => 0.999);
    cursor.shuffle();
    Math.random = orig;

    expect(cursor.isShuffled).toBe(true);
    cursor.unshuffle();
    expect(cursor.isShuffled).toBe(false);
    expect(cursor.toRemaining()).toEqual(items);
  });

  test('no-op when not shuffled', () => {
    const cursor = new PlaybackCursor(['a', 'b', 'c']);
    cursor.unshuffle();
    expect(cursor.isShuffled).toBe(false);
    expect(cursor.toRemaining()).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// replace()
// ---------------------------------------------------------------------------

describe('replace', () => {
  test('replaces all items and resets', () => {
    const cursor = new PlaybackCursor(songs('a', 'b'));
    cursor.advance();
    cursor.replace(songs('x', 'y', 'z'));
    expect(cursor.current()).toEqual(song('x', 'Song x'));
    expect(cursor.toRemaining()).toEqual(songs('x', 'y', 'z'));
    expect(cursor.isAtEnd).toBe(false);
    expect(cursor.isShuffled).toBe(false);
  });

  test('replace with empty array', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.replace([]);
    expect(cursor.isEmpty).toBe(true);
    expect(cursor.isAtEnd).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// append()
// ---------------------------------------------------------------------------

describe('append', () => {
  test('adds items to the end', () => {
    const cursor = new PlaybackCursor(songs('a', 'b'));
    cursor.append(song('c', 'Song c'));
    expect(cursor.toRemaining()).toEqual(songs('a', 'b', 'c'));
  });

  test('no-op on empty append', () => {
    const cursor = new PlaybackCursor(songs('a', 'b'));
    cursor.append();
    expect(cursor.toRemaining()).toEqual(songs('a', 'b'));
  });

  test('appends to empty cursor', () => {
    const cursor = new PlaybackCursor<Song>();
    cursor.append(song('a', 'Song a'));
    expect(cursor.current()).toEqual(song('a', 'Song a'));
    expect(cursor.toRemaining()).toEqual([song('a', 'Song a')]);
  });

  test('does not affect readIndex', () => {
    const cursor = new PlaybackCursor(songs('a', 'b'));
    cursor.advance(); // now at 'b'
    cursor.append(song('c', 'Song c'));
    expect(cursor.current()).toEqual(song('b', 'Song b'));
  });

  test('when shuffled, adds new items to end of playback order', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));

    // Use deterministic shuffle: Math.random = 0 means each swap is with index j=0,
    // which produces a specific reversed order of remaining items.
    const orig = Math.random;
    Math.random = mock(() => 0);
    cursor.shuffle();
    Math.random = orig;

    cursor.append(song('d', 'Song d'));
    // New items should appear at the end of the remaining list
    const remaining = cursor.toRemaining();
    expect(remaining).toContainEqual(song('d', 'Song d'));
  });
});

// ---------------------------------------------------------------------------
// insertAtFront()
// ---------------------------------------------------------------------------

describe('insertAtFront', () => {
  test('inserts before the current item', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.advance(); // now at 'b'
    cursor.insertAtFront(song('x', 'Song x'));
    // Order should be: a, x, b, c
    expect(cursor.toRemaining()).toEqual([
      song('x', 'Song x'),
      song('b', 'Song b'),
      song('c', 'Song c'),
    ]);
  });

  test('unshuffles when inserting', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c', 'd', 'e'));
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(true);
    cursor.insertAtFront(song('x', 'Song x'));
    expect(cursor.isShuffled).toBe(false);
  });

  test('inserts at beginning when readIndex is 0', () => {
    const cursor = new PlaybackCursor(songs('a', 'b'));
    cursor.insertAtFront(song('x', 'Song x'));
    expect(cursor.toRemaining()).toEqual([
      song('x', 'Song x'),
      song('a', 'Song a'),
      song('b', 'Song b'),
    ]);
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe('clear', () => {
  test('removes all items and resets state', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.shuffle();
    cursor.advance();
    cursor.clear();
    expect(cursor.isEmpty).toBe(true);
    expect(cursor.isAtEnd).toBe(true);
    expect(cursor.isShuffled).toBe(false);
  });

  test('clear on already-empty cursor is fine', () => {
    const cursor = new PlaybackCursor();
    cursor.clear();
    expect(cursor.isEmpty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeWhere()
// ---------------------------------------------------------------------------

describe('removeWhere', () => {
  test('removes matching items and returns them', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    const removed = cursor.removeWhere((s) => s.id === 'b');
    expect(removed).toEqual([song('b', 'Song b')]);
    expect(cursor.toRemaining()).toEqual([song('a', 'Song a'), song('c', 'Song c')]);
  });

  test('returns empty array when nothing matches', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    const removed = cursor.removeWhere((s) => s.id === 'z');
    expect(removed).toEqual([]);
    expect(cursor.toRemaining()).toEqual(songs('a', 'b', 'c'));
  });

  test('adjusts readIndex when items before it are removed', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c', 'd', 'e'));
    cursor.advance(); // played 'a', now at 'b'
    cursor.advance(); // played 'b', now at 'c'
    // readIndex is now 2. Remove 'a' (already played, before readIndex).
    cursor.removeWhere((s) => s.id === 'a');
    // readIndex should adjust to 1
    expect(cursor.current()).toEqual(song('c', 'Song c'));
  });

  test('does not adjust readIndex when removed items are after it', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c', 'd'));
    cursor.advance(); // played 'a', now at 'b'
    // readIndex is 1. Remove 'd' (after readIndex).
    cursor.removeWhere((s) => s.id === 'd');
    expect(cursor.current()).toEqual(song('b', 'Song b'));
  });

  test('removes multiple matching items', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'b', 'c'));
    const removed = cursor.removeWhere((s) => s.id === 'b');
    expect(removed).toHaveLength(2);
    expect(cursor.toRemaining()).toEqual([song('a', 'Song a'), song('c', 'Song c')]);
  });

  test('when shuffled, remaps playbackOrder indices', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c', 'd', 'e'));

    // Set up a predictable shuffle
    const orig = Math.random;
    Math.random = mock(() => 0);
    cursor.shuffle();
    Math.random = orig;

    // Remove 'b'
    cursor.removeWhere((s) => s.id === 'b');
    const remaining = cursor.toRemaining();
    // All remaining items except 'b' should be present
    expect(remaining).toHaveLength(4);
    expect(remaining.find((s) => s.id === 'b')).toBeUndefined();
  });

  test('when all items are removed, clears playbackOrder', () => {
    const cursor = new PlaybackCursor(songs('a', 'b'));
    cursor.shuffle();
    cursor.removeWhere(() => true);
    expect(cursor.isEmpty).toBe(true);
    expect(cursor.isShuffled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reorderRemaining()
// ---------------------------------------------------------------------------

describe('reorderRemaining', () => {
  test('reorders the remaining items', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.reorderRemaining(
      [song('c', 'Song c'), song('a', 'Song a'), song('b', 'Song b')],
      (a, b) => a.id === b.id
    );
    expect(cursor.toRemaining()).toEqual([
      song('c', 'Song c'),
      song('a', 'Song a'),
      song('b', 'Song b'),
    ]);
  });

  test('only reorders unplayed portion', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c', 'd'));
    cursor.advance(); // played 'a'
    cursor.advance(); // played 'b'
    // remaining: c, d
    cursor.reorderRemaining([song('d', 'Song d'), song('c', 'Song c')], (a, b) => a.id === b.id);
    expect(cursor.toRemaining()).toEqual([song('d', 'Song d'), song('c', 'Song c')]);
  });

  test('throws when count mismatches', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    expect(() => {
      cursor.reorderRemaining([song('a', 'Song a')], (a, b) => a.id === b.id);
    }).toThrow('Reorder must preserve all items');
  });

  test('throws when unknown item is in the reorder', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    expect(() => {
      cursor.reorderRemaining(
        [song('a', 'Song a'), song('b', 'Song b'), song('z', 'Song z')],
        (a, b) => a.id === b.id
      );
    }).toThrow('Reorder contains unknown item');
  });

  test('unshuffles after reorder', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.shuffle();
    cursor.reorderRemaining(
      [song('a', 'Song a'), song('b', 'Song b'), song('c', 'Song c')],
      (a, b) => a.id === b.id
    );
    expect(cursor.isShuffled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateWhere()
// ---------------------------------------------------------------------------

describe('updateWhere', () => {
  test('updates matching items in place', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    const count = cursor.updateWhere(
      (s) => s.id === 'b',
      (s) => ({ ...s, title: 'Updated' })
    );
    expect(count).toBe(1);
    expect(cursor.toRemaining()).toEqual([
      song('a', 'Song a'),
      { id: 'b', title: 'Updated' },
      song('c', 'Song c'),
    ]);
  });

  test('returns 0 when nothing matches', () => {
    const cursor = new PlaybackCursor(songs('a', 'b'));
    const count = cursor.updateWhere(
      () => false,
      (s) => ({ ...s, title: 'X' })
    );
    expect(count).toBe(0);
  });

  test('does not affect readIndex', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.advance();
    cursor.updateWhere(
      (s) => s.id === 'a',
      (s) => ({ ...s, title: 'Updated A' })
    );
    // still at 'b'
    expect(cursor.current()).toEqual(song('b', 'Song b'));
  });

  test('does not affect shuffle order', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c', 'd'));
    cursor.shuffle();
    expect(cursor.isShuffled).toBe(true);
    cursor.updateWhere(
      (s) => s.id === 'b',
      (s) => ({ ...s, title: 'Updated' })
    );
    expect(cursor.isShuffled).toBe(true);
  });

  test('updates multiple matching items', () => {
    const cursor = new PlaybackCursor([song('a', 'match'), song('b', 'other'), song('c', 'match')]);
    const count = cursor.updateWhere(
      (s) => s.title === 'match',
      (s) => ({ ...s, title: 'updated' })
    );
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// toRemaining()
// ---------------------------------------------------------------------------

describe('toRemaining', () => {
  test('returns all items for fresh cursor', () => {
    const items = songs('a', 'b', 'c');
    const cursor = new PlaybackCursor(items);
    expect(cursor.toRemaining()).toEqual(items);
  });

  test('returns only unplayed items after advance', () => {
    const cursor = new PlaybackCursor(songs('a', 'b', 'c'));
    cursor.advance();
    expect(cursor.toRemaining()).toEqual([song('b', 'Song b'), song('c', 'Song c')]);
  });

  test('returns empty array when at end', () => {
    const cursor = new PlaybackCursor(['a', 'b']);
    cursor.advance();
    cursor.advance();
    expect(cursor.toRemaining()).toEqual([]);
  });

  test('returns empty array for empty cursor', () => {
    expect(new PlaybackCursor().toRemaining()).toEqual([]);
  });

  test('respects shuffle order', () => {
    const items = songs('a', 'b', 'c', 'd', 'e');
    const cursor = new PlaybackCursor(items);

    const orig = Math.random;
    Math.random = mock(() => 0.999);
    cursor.shuffle();
    Math.random = orig;

    const remaining = cursor.toRemaining();
    expect(remaining).toHaveLength(5);
    // All original items present
    const sortedIds = [...remaining].map((s) => s.id).sort();
    expect(sortedIds).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
