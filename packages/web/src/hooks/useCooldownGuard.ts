import { useCallback, useEffect, useRef } from 'react';

import { useNotification } from './useNotification';
import { useRateLimit } from './useRateLimit';

// ---------------------------------------------------------------------------
// Shared cooldown guard for player-mutations rate limiting.
//
// Provides the building blocks for any button that triggers a player mutation:
//   - coolingDown / retryAfterSeconds   — state from the rate limit headers
//   - statusTitle                       — ready-to-use tooltip (cooldown countdown
//                                         or approaching warning, or undefined)
//   - handleCooldownClick               — debounced toast for dimmed-button clicks
//
// The toast debounce is module-level so all components share one timer —
// clicking a dimmed play button and a dimmed shuffle button won't fire
// two toasts within the same 6s window.
//
// CooldownState is the canonical prop shape for passing cooldown awareness
// into memo children — use it alongside cooldownButtonProps() to avoid
// repeating the onClick / disabled / dimmed / title ternaries.
// ---------------------------------------------------------------------------

export interface CooldownState {
  coolingDown: boolean;
  statusTitle: string | undefined;
  onCooldownClick: () => void;
}

let lastToast = 0;
let proactiveFired = false; // prevent duplicate proactive toasts across instances
const TOAST_INTERVAL_MS = 6000;

export function useCooldownGuard() {
  const { coolingDown, approaching, retryAfterSeconds } = useRateLimit('player-mutations');
  const { notify } = useNotification();
  const prevCoolingDownRef = useRef(coolingDown);

  // When cooldown first kicks in, show a proactive toast once globally and
  // reset the debounce timer so the message isn't immediately replaced by
  // a dimmed-click toast.
  useEffect(() => {
    if (coolingDown && !prevCoolingDownRef.current && !proactiveFired) {
      proactiveFired = true;
      lastToast = Date.now();
      notify(
        `Rate limit reached. Controls will be disabled for ${retryAfterSeconds}s.`,
        'error',
        5000
      );
    }
    if (!coolingDown) {
      proactiveFired = false;
    }
    prevCoolingDownRef.current = coolingDown;
  }, [coolingDown, retryAfterSeconds, notify]);

  const handleCooldownClick = useCallback(() => {
    const now = Date.now();
    if (now - lastToast < TOAST_INTERVAL_MS) {
      return;
    }
    lastToast = now;
    notify(`${retryAfterSeconds}s remaining until controls are re-enabled.`, 'error', 5000);
  }, [retryAfterSeconds, notify]);

  const cooldownTitle = coolingDown ? `Cooldown — ${retryAfterSeconds}s remaining` : undefined;
  const approachingTitle = approaching ? 'Approaching rate limit — slow down' : undefined;
  const statusTitle = cooldownTitle ?? approachingTitle;

  return {
    coolingDown,
    approaching,
    retryAfterSeconds,
    statusTitle,
    handleCooldownClick,
  } as const;
}
