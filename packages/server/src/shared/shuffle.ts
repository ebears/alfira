/**
 * Fisher-Yates in-place shuffle.
 * Mutates the array directly for O(1) extra space.
 */
export function fisherYatesShuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j] ?? arr[i];
    arr[j] = temp ?? arr[j];
  }
}
