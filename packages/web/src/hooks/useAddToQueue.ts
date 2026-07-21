import { useCallback } from 'react';

import { addToPriorityQueue } from '../api/api';
import { apiErrorMessage, isRateLimitError } from '../utils/api';
import { useNotification } from './useNotification';

export function useAddToQueue() {
  const { notification, notify } = useNotification();

  const handleAddToQueue = useCallback(
    async (songId: string) => {
      try {
        await addToPriorityQueue(songId);
        notify('Added to Up Next', 'success');
      } catch (error: unknown) {
        if (!isRateLimitError(error)) {
          notify(
            apiErrorMessage(error, 'Could not add to queue. Is the bot in a voice channel?'),
            'error',
            5000
          );
        }
      }
    },
    [notify]
  );

  return { handleAddToQueue, notification };
}
