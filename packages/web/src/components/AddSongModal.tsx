import type { Song } from '@alfira-bot/server/shared';
import { useEffect, useRef, useState } from 'react';
import { addSong, importPlaylist } from '../api/api';
import { apiErrorMessage } from '../utils/api';
import { Backdrop } from './Backdrop';
import { Button } from './ui/Button';

export default function AddSongModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (song: Song) => void;
}) {
  const [url, setUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const isPlaylist = url.includes('list=');
  const [importFullPlaylist, setImportFullPlaylist] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-close after successful playlist import
  useEffect(() => {
    if (successMsg) {
      const id = setTimeout(() => onClose(), 1500);
      return () => clearTimeout(id);
    }
  }, [successMsg, onClose]);

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (importFullPlaylist) {
        // Import playlist
        const result = await importPlaylist(url.trim());
        setSuccessMsg(result.message);
        // Close modal after a short delay to show success message
        // The socket events will update the song list automatically
      } else {
        // Add single song
        const song = await addSong(url.trim(), nickname.trim() || undefined);
        onAdded(song);
      }
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Something went wrong. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="bg-surface rounded-xl p-5 md:p-6 w-full max-w-md mx-4 modal-clay animate-fade-up">
        <h2 className="font-display text-2xl md:text-3xl text-fg tracking-wider mb-1">Add Song</h2>
        <p className="font-mono text-xs text-muted mb-4 md:mb-6">paste a url</p>

        <input
          ref={inputRef}
          className="input mb-3"
          placeholder="https://..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
            setSuccessMsg('');
          }}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        {isPlaylist && (
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={importFullPlaylist}
              onChange={(e) => setImportFullPlaylist(e.target.checked)}
              disabled={loading}
              className="w-4 h-4 rounded border-border bg-surface accent-accent"
            />
            <span className="font-mono text-xs text-fg">Import full playlist</span>
          </label>
        )}

        {!importFullPlaylist && (
          <input
            className="input mb-3"
            placeholder="Nickname (optional)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={loading}
          />
        )}

        {error && <p className="font-mono text-xs text-danger mb-3">{error}</p>}

        {successMsg && <p className="font-mono text-xs text-success mb-3">{successMsg}</p>}

        {loading && (
          <p className="font-mono text-xs text-muted mb-3 flex items-center gap-2">
            <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin inline-block" />
            {importFullPlaylist ? 'importing playlist...' : 'fetching metadata...'}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="inherit" onClick={onClose} disabled={loading} surface="surface">
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading || !url.trim()}>
            {importFullPlaylist ? 'Import' : 'Add'}
          </Button>
        </div>
      </div>
    </Backdrop>
  );
}
