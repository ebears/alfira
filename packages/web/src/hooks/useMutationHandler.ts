import { useCallback, useRef, useState } from 'react';

import { apiErrorMessage, isRateLimitError } from '../utils/api';
import { useNotification } from './useNotification';

/**
 * Reusable mutation handler for player controls.
 *
 * Provides:
 *   - `busy`    — boolean state for showing a spinner / disabling the button
 *   - `handler` — async callback with synchronous ref guard (prevents
 *                 rapid double-clicks bypassing React state), 429 suppression
 *                 (cooldown UI handles those), and error notification.
 *
 * @param action       Async function that performs the mutation.
 * @param errorMessage Human-readable fallback shown if the call fails with
 *                     a non-rate-limit error.
 */
export function useMutationHandler(action: () => Promise<void>, errorMessage: string) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const { notify } = useNotification();

  const handler = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (!isRateLimitError(error)) {
        notify(apiErrorMessage(error, errorMessage), 'error', 5000);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [action, errorMessage, notify]);

  return { busy, handler };
}
