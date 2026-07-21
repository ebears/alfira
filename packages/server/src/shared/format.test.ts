import { describe, expect, test } from 'bun:test';

import { formatDuration } from './format';

describe('formatDuration', () => {
  test('formats whole minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(120)).toBe('2:00');
    expect(formatDuration(600)).toBe('10:00');
  });

  test('formats seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(1)).toBe('0:01');
    expect(formatDuration(30)).toBe('0:30');
    expect(formatDuration(59)).toBe('0:59');
  });

  test('formats mixed minutes and seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3661)).toBe('61:01');
  });

  test('pads seconds to two digits', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
  });

  test('rounds fractional seconds', () => {
    expect(formatDuration(0.4)).toBe('0:00');
    expect(formatDuration(0.5)).toBe('0:01');
    expect(formatDuration(59.9)).toBe('1:00');
  });

  test('negative values produce negative output', () => {
    // formatDuration doesn't guard against negative input — it applies
    // Math.floor and % to the negative number directly
    expect(formatDuration(-5)).toBe('-1:-5');
    expect(formatDuration(-60)).toBe('-1:00');
  });

  test('handles NaN and Infinity', () => {
    expect(formatDuration(Number.NaN)).toBe('NaN:NaN');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('Infinity:NaN');
  });
});
