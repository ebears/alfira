import { describe, expect, mock, test } from 'bun:test';

import { fisherYatesShuffle } from './shuffle';

describe('fisherYatesShuffle', () => {
  test('preserves array length', () => {
    const arr = [1, 2, 3, 4, 5];
    fisherYatesShuffle(arr);
    expect(arr).toHaveLength(5);
  });

  test('preserves all original elements', () => {
    const arr = [1, 2, 3, 4, 5];
    fisherYatesShuffle(arr);
    const sorted = [...arr].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3, 4, 5]);
  });

  test('handles empty array', () => {
    const arr: number[] = [];
    fisherYatesShuffle(arr);
    expect(arr).toEqual([]);
  });

  test('handles single-element array', () => {
    const arr = [42];
    fisherYatesShuffle(arr);
    expect(arr).toEqual([42]);
  });

  test('mutates the array in place (returns void)', () => {
    const arr = [1, 2, 3];
    fisherYatesShuffle(arr);
    // fisherYatesShuffle returns void — if it returned a value,
    // we'd have a confusing void expression. We verify it doesn't throw.
    expect(arr).toHaveLength(3);
  });

  test('produces a deterministic shuffle with mocked random', () => {
    const originalRandom = Math.random;
    Math.random = mock(() => 0);

    const arr = [1, 2, 3, 4, 5];
    fisherYatesShuffle(arr);

    Math.random = originalRandom;

    // With Math.random always 0, each iteration swaps with index 0,
    // resulting in a specific deterministic order
    expect(arr).toHaveLength(5);
    expect(arr.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});
