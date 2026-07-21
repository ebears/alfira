import { describe, expect, test } from 'bun:test';

import { parsePagination } from './pagination';

describe('parsePagination', () => {
  test('returns defaults when no params provided', () => {
    const url = new URL('http://localhost/');
    const result = parsePagination(url);
    expect(result).toEqual({ page: 1, limit: 30, skip: 0 });
  });

  test('returns custom default limit', () => {
    const url = new URL('http://localhost/');
    const result = parsePagination(url, 50);
    expect(result).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  test('parses page and limit from query params', () => {
    const url = new URL('http://localhost/?page=3&limit=10');
    const result = parsePagination(url);
    expect(result).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  test('clamps negative page to 1', () => {
    const url = new URL('http://localhost/?page=-5');
    expect(parsePagination(url).page).toBe(1);
  });

  test('clamps page of 0 to 1', () => {
    const url = new URL('http://localhost/?page=0');
    expect(parsePagination(url).page).toBe(1);
  });

  test('clamps limit above 100', () => {
    const url = new URL('http://localhost/?limit=200');
    expect(parsePagination(url).limit).toBe(100);
  });

  test('limit of 0 falls back to default (falsy)', () => {
    const url = new URL('http://localhost/?limit=0');
    expect(parsePagination(url).limit).toBe(30);
  });

  test('clamps negative limit', () => {
    const url = new URL('http://localhost/?limit=-10');
    expect(parsePagination(url).limit).toBe(1);
  });

  test('handles non-numeric values gracefully', () => {
    const url = new URL('http://localhost/?page=abc&limit=xyz');
    const result = parsePagination(url);
    // NaN || fallback → falls back to defaults
    expect(result.page).toBe(1);
    expect(result.limit).toBe(30);
  });

  test('skip is computed correctly', () => {
    const url = new URL('http://localhost/?page=4&limit=25');
    expect(parsePagination(url).skip).toBe(75);
  });
});
