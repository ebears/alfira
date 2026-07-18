import { useCallback, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Client-side rate limit tracking
//
// The server sends X-RateLimit-* headers on every player mutation response.
// wrappedFetch (in client.ts) calls updateRateLimit() with the parsed values.
// This hook reads from the same store so components can react to changes.
// ---------------------------------------------------------------------------

interface RateLimitState {
  limit: number;
  remaining: number;
  resetAt: number; // Unix seconds
}

const defaultState: RateLimitState = { limit: 30, remaining: 30, resetAt: 0 };

// Module-level state keyed by bucket name.
const state = new Map<string, RateLimitState>();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => void listeners.delete(callback);
}

/**
 * Called by wrappedFetch whenever rate limit headers are present on a response.
 * External consumers should not call this directly.
 */
export function updateRateLimit(
  bucket: string,
  limit: number,
  remaining: number,
  resetAt: number
): void {
  state.set(bucket, { limit, remaining, resetAt });
  for (const listener of listeners) {
    listener();
  }
}

// ---------------------------------------------------------------------------
// Computed snapshot
//
// useSyncExternalStore detects changes via Object.is on the returned value.
// The raw store state ({remaining, resetAt}) doesn't change when wall-clock
// time advances past resetAt, so we must fold the time-dependent computation
// into getSnapshot. Otherwise React sees the same object and skips re-renders,
// leaving controls visually disabled even after the cooldown expires.
// ---------------------------------------------------------------------------

export interface RateLimitSnapshot {
  limit: number;
  remaining: number;
  resetAt: number;
  coolingDown: boolean;
  approaching: boolean;
  retryAfterSeconds: number;
}

function computeSnapshot(raw: RateLimitState, nowSec: number): RateLimitSnapshot {
  const expired = raw.resetAt > 0 && nowSec >= raw.resetAt;
  const remaining = expired ? raw.limit : raw.remaining;
  const coolingDown = !expired && raw.resetAt > 0 && remaining === 0;
  const approaching = !coolingDown && remaining <= 5 && remaining > 0;
  const retryAfterSeconds = coolingDown ? Math.max(0, raw.resetAt - nowSec) : 0;

  return {
    limit: raw.limit,
    remaining,
    resetAt: raw.resetAt,
    coolingDown,
    approaching,
    retryAfterSeconds,
  };
}

// Cache per-bucket so we only return a new object when fields actually change.
// Returning a fresh object every call causes an infinite loop —
// Object.is always says "changed", triggering another render.
const snapshotCache = new Map<string, RateLimitSnapshot>();

function getSnapshot(bucket: string): RateLimitSnapshot {
  const raw = state.get(bucket) ?? defaultState;
  const next = computeSnapshot(raw, Math.floor(Date.now() / 1000));
  const cached = snapshotCache.get(bucket);

  // Same reference if nothing changed — prevents infinite re-renders.
  if (
    cached &&
    cached.limit === next.limit &&
    cached.remaining === next.remaining &&
    cached.resetAt === next.resetAt &&
    cached.coolingDown === next.coolingDown &&
    cached.approaching === next.approaching &&
    cached.retryAfterSeconds === next.retryAfterSeconds
  ) {
    return cached;
  }

  snapshotCache.set(bucket, next);
  return next;
}

/**
 * React hook that returns the current rate limit status for a route bucket.
 *
 * `bucket` corresponds to the server-side route group (e.g. 'player-mutations').
 */
export function useRateLimit(bucket: string): RateLimitSnapshot {
  return useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(cb), []),
    useCallback(() => getSnapshot(bucket), [bucket])
  );
}

// ---------------------------------------------------------------------------
// Side-effect: tick every second to trigger re-renders so the displayed
// countdown doesn't appear frozen.
//
// Accuracy comes from computing remaining time against wall-clock (resetAt -
// Date.now()), not from counting ticks. setInterval is throttled by browsers
// when the tab is in the background, so we also listen for visibilitychange
// to force an immediate re-render when the user returns.
// ---------------------------------------------------------------------------

let tickInterval: ReturnType<typeof setInterval> | null = null;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function ensureTicking() {
  if (tickInterval !== null) return;
  tickInterval = setInterval(notifyListeners, 1000);
}

// Start ticking as soon as this module is imported.
ensureTicking();

if (typeof window !== 'undefined') {
  // Force an immediate tick when the tab becomes visible again — the browser
  // may have throttled setInterval while the tab was backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      notifyListeners();
    }
  });

  // Clean up on unload.
  window.addEventListener('beforeunload', () => {
    if (tickInterval !== null) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  });
}
