import { useState } from 'react';
import { quickAddPlaylistToQueue, quickAddToQueue } from '../../api/api';
import { apiErrorMessage } from '../../utils/api';
import { Backdrop } from '../Backdrop';
import { Button } from '../ui/Button';

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

  const handleSubmit = async () => {
    if (!sourceUrl.trim()) return;
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
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not add song to queue. Is the bot in a voice channel?'));
      setSubmitting(false);
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="p-5 md:p-6 w-full max-w-sm mx-4 modal-clay animate-fade-up">
        <h2 className="font-display text-2xl md:text-3xl text-fg tracking-wider mb-1">Quick Add</h2>
        <p className="font-mono text-xs text-muted mb-4 md:mb-6">
          add a url to Up Next without saving to library
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <p className="font-mono text-xs text-muted mb-2 uppercase tracking-widest">
              Source URL
            </p>
            <input
              type="text"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                setError('');
                setSuccessMsg('');
              }}
              placeholder="https://..."
              className="input w-full"
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sourceUrl.trim()) {
                  handleSubmit();
                }
              }}
            />
            {isPlaylist && (
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={importFullPlaylist}
                  onChange={(e) => setImportFullPlaylist(e.target.checked)}
                  disabled={submitting}
                  className="w-4 h-4 rounded border-border bg-surface accent-accent"
                />
                <span className="font-mono text-xs text-fg">Add all songs from playlist</span>
              </label>
            )}
          </div>
        </div>

        {successMsg && <p className="font-mono text-xs text-success mb-4">{successMsg}</p>}
        {error && <p className="font-mono text-xs text-danger mb-4">{error}</p>}

        {submitting && (
          <p className="font-mono text-xs text-muted mb-4 flex items-center gap-2">
            <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin inline-block" />
            {importFullPlaylist ? 'Adding playlist...' : 'Adding...'}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button
            variant="inherit"
            type="button"
            onClick={onClose}
            disabled={submitting}
            surface="surface"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !sourceUrl.trim()}
          >
            {submitting ? 'Adding...' : importFullPlaylist ? 'Add Playlist' : 'Add to Up Next'}
          </Button>
        </div>
      </div>
    </Backdrop>
  );
}
