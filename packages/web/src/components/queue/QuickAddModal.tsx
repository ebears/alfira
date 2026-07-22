import type React from 'react';

import { useCallback, useState } from 'react';

import { quickAddPlaylistToQueue, quickAddToQueue } from '../../api/api';
import { apiErrorMessage, isRateLimitError } from '../../utils/api';
import { Backdrop } from '../Backdrop';
import { Button } from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import { Spinner } from '../ui/Spinner';
import { SpringUp } from '../ui/SpringUp';

export default function QuickAddModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const isPlaylist = sourceUrl.includes('list=');
  const [importFullPlaylist, setImportFullPlaylist] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!sourceUrl.trim()) {
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      if (importFullPlaylist) {
        const result = await quickAddPlaylistToQueue(sourceUrl.trim());
        setSuccessMsg(result.message);
        setTimeout(() => {
          onAdded();
        }, 1500);
      } else {
        await quickAddToQueue(sourceUrl.trim());
        onAdded();
      }
    } catch (error: unknown) {
      if (!isRateLimitError(error)) {
        setError(
          apiErrorMessage(error, 'Could not add song to queue. Is the bot in a voice channel?')
        );
      }
      setSubmitting(false);
    }
  }, [sourceUrl, importFullPlaylist, onAdded]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSourceUrl(e.target.value);
    setError('');
    setSuccessMsg('');
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
        <h2 className='font-display text-fg mb-1 text-2xl tracking-wider md:text-3xl'>Quick Add</h2>
        <p className='text-muted mb-4 font-mono text-xs md:mb-6'>
          add a url to Up Next without saving to library
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
            {isPlaylist && (
              <label className='mt-2 flex cursor-pointer items-center gap-2'>
                <Checkbox
                  checked={importFullPlaylist}
                  onChange={setImportFullPlaylist}
                  disabled={submitting}
                />
                <span className='text-fg font-mono text-xs'>Add all songs from playlist</span>
              </label>
            )}
          </div>
        </div>

        {successMsg && <p className='text-success mb-4 font-mono text-xs'>{successMsg}</p>}
        {error && <p className='text-danger mb-4 font-mono text-xs'>{error}</p>}

        {submitting && (
          <p className='text-muted mb-4 flex items-center gap-2 font-mono text-xs'>
            <Spinner />
            {importFullPlaylist ? 'Adding playlist...' : 'Adding...'}
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
            variant='primary'
            type='button'
            onClick={handleSubmit}
            disabled={submitting || !sourceUrl.trim()}
          >
            {submitting ? 'Adding...' : importFullPlaylist ? 'Add Playlist' : 'Add to Up Next'}
          </Button>
        </div>
      </SpringUp>
    </Backdrop>
  );
}
