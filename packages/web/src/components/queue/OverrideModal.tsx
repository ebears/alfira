import type React from 'react';

import { WarningIcon } from '@phosphor-icons/react';
import { useCallback, useState } from 'react';

import { overridePlay } from '../../api/api';
import { apiErrorMessage, isRateLimitError } from '../../utils/api';
import { Backdrop } from '../Backdrop';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { SpringUp } from '../ui/SpringUp';

export default function OverrideModal({
  onClose,
  onOverride,
}: {
  onClose: () => void;
  onOverride: () => void;
}) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!sourceUrl.trim()) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await overridePlay(sourceUrl.trim());
      onOverride();
    } catch (error: unknown) {
      if (!isRateLimitError(error)) {
        setError(
          apiErrorMessage(error, 'Could not override playback. Is the bot in a voice channel?')
        );
      }
      setSubmitting(false);
    }
  }, [sourceUrl, onOverride]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSourceUrl(e.target.value);
    setError('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && sourceUrl.trim()) {
        void handleSubmit();
      }
    },
    [sourceUrl, handleSubmit]
  );

  return (
    <Backdrop onClose={onClose}>
      <SpringUp className='glass-modal mx-4 w-full max-w-sm p-5 md:p-6'>
        <h2 className='font-display text-fg mb-1 text-2xl tracking-wider md:text-3xl'>Override</h2>
        <p className='text-danger mb-4 font-mono text-xs md:mb-6'>
          <WarningIcon size={14} weight='duotone' className='mr-1 inline' /> This will stop current
          playback, clear all queues, and play the requested song immediately.
        </p>

        <div className='mb-6 space-y-4'>
          <div>
            <p className='text-muted mb-2 font-mono text-xs tracking-widest uppercase'>
              Source URL
            </p>
            <input
              type='text'
              value={sourceUrl}
              onChange={handleChange}
              placeholder='https://...'
              className='input w-full'
              disabled={submitting}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {error && <p className='text-danger mb-4 font-mono text-xs'>{error}</p>}

        {submitting && (
          <p className='text-muted mb-4 flex items-center gap-2 font-mono text-xs'>
            <Spinner />
            Overriding...
          </p>
        )}

        <div className='flex justify-end gap-2'>
          <Button
            variant='inherit'
            type='button'
            onClick={onClose}
            disabled={submitting}
            surface='surface'
          >
            Cancel
          </Button>
          <Button
            variant='danger'
            type='button'
            onClick={handleSubmit}
            disabled={submitting || !sourceUrl.trim()}
          >
            {submitting ? 'Overriding...' : 'Override & Play'}
          </Button>
        </div>
      </SpringUp>
    </Backdrop>
  );
}
