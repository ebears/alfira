import type { RequestPreview, Song } from '@alfira-bot/server/shared';
import { useEffect, useRef, useState } from 'react';
import { createRequest, previewRequest } from '../api/api';
import { useTagColors } from '../context/TagsContext';
import { apiErrorMessage } from '../utils/api';
import { getTagColorClasses } from '../utils/tagColors';
import { Backdrop } from './Backdrop';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import Checkbox from './ui/Checkbox';
import { Spinner } from './ui/Spinner';

type Step = 'url' | 'metadata';

export default function AddSongModal({
  onClose,
  onAdded,
  onRequestCreated,
}: {
  onClose: () => void;
  onAdded: (song: Song) => void;
  onRequestCreated?: () => void;
}) {
  const { tagColorMap } = useTagColors();

  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Playlist detection
  const isPlaylist = url.includes('list=');

  // Preview data from server
  const [preview, setPreview] = useState<RequestPreview | null>(null);

  // Editable metadata fields
  const [nickname, setNickname] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [artwork, setArtwork] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [volumeBoost, setVolumeBoost] = useState('');
  const [notifyDm, setNotifyDm] = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlInputRef.current?.focus();
  }, []);

  // Auto-close after successful submission
  useEffect(() => {
    if (successMsg) {
      const id = setTimeout(() => onClose(), 1500);
      return () => clearTimeout(id);
    }
  }, [successMsg, onClose]);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');

    try {
      const result = await previewRequest(url.trim());
      setPreview(result);

      // Pre-fill fields from metadata
      setNickname('');
      setArtist(result.artist ?? '');
      setAlbum('');
      setArtwork(result.artworkUrl ?? '');
      setTags([]);
      setTagInput('');
      setVolumeBoost('0');

      if (result.alreadyExists) {
        setError('This song is already in your library or has been requested.');
      }

      setStep('metadata');
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not fetch track info. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleImportPlaylist = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const result = await createRequest({
        sourceUrl: url.trim(),
        type: 'playlist',
      });

      onRequestCreated?.();
      if (result.autoApproved) {
        setSuccessMsg(
          `Imported ${result.importedCount ?? result.songs?.length ?? 0} songs from "${result.playlistTitle ?? 'playlist'}".`
        );
      } else {
        setSuccessMsg('Playlist request submitted! An admin will review it.');
      }
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not import playlist. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const parsedBoost = volumeBoost.trim() === '' ? null : parseInt(volumeBoost.trim(), 10);

      const result = await createRequest({
        sourceUrl: url.trim(),
        notifyDm,
        nickname: nickname.trim() || null,
        artist: artist.trim() || null,
        album: album.trim() || null,
        artwork: artwork.trim() || null,
        tags: tags.length > 0 ? tags : undefined,
        volumeBoost: parsedBoost != null && !Number.isNaN(parsedBoost) ? parsedBoost : null,
      });

      onRequestCreated?.();
      if (result.autoApproved) {
        if (result.song) {
          onAdded(result.song);
        } else if (result.songs) {
          // Playlist auto-import
          setSuccessMsg(`Imported ${result.importedCount} songs from "${result.playlistTitle}".`);
        }
      } else {
        setSuccessMsg('Request submitted! An admin will review it.');
      }
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Something went wrong. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && step === 'url') {
      handleFetch();
    }
    if (e.key === 'Escape') {
      if (step === 'metadata') setStep('url');
      else onClose();
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handleBackToUrl = () => {
    setStep('url');
    setError('');
  };

  const canSubmit = step === 'metadata' && !loading && !preview?.alreadyExists;

  return (
    <Backdrop onClose={onClose}>
      <div className='p-5 md:p-6 w-full max-w-md mx-4 glass-modal animate-fade-up'>
        <h2 className='font-display text-2xl md:text-3xl text-fg tracking-wider mb-1'>
          Request Song
        </h2>
        <p className='font-mono text-xs text-muted mb-4 md:mb-6'>
          {step === 'url' ? 'paste a url' : (preview?.title ?? 'review details')}
        </p>

        {/* Step 1: URL input */}
        {step === 'url' && (
          <>
            <input
              ref={urlInputRef}
              className='input mb-3'
              placeholder='https://...'
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
              <p className='font-mono text-[10px] text-muted mb-3'>
                Playlist detected — Fetch to add a single track, or import the full playlist.
              </p>
            )}

            {error && <p className='font-mono text-xs text-danger mb-3'>{error}</p>}

            {loading && (
              <p className='font-mono text-xs text-muted mb-3 flex items-center gap-2'>
                <Spinner />
                loading...
              </p>
            )}

            <div className='flex gap-2 justify-end'>
              <Button variant='inherit' onClick={onClose} disabled={loading} surface='surface'>
                Cancel
              </Button>
              {isPlaylist && (
                <button
                  type='button'
                  className='btn-primary-secondary'
                  onClick={handleImportPlaylist}
                  disabled={loading || !url.trim()}
                >
                  Import Playlist
                </button>
              )}
              <Button variant='primary' onClick={handleFetch} disabled={loading || !url.trim()}>
                Fetch
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Metadata fields */}
        {step === 'metadata' && preview && (
          <div className='flex flex-col gap-3'>
            {/* Thumbnail + title + duration + source */}
            <div className='flex items-center gap-3 -mb-1'>
              {(preview.artworkUrl || preview.thumbnailUrl) && (
                <div className='w-12 h-12 rounded border border-border shrink-0 overflow-hidden bg-elevated'>
                  <ArtworkImage
                    src={preview.artworkUrl || preview.thumbnailUrl}
                    alt='Album art'
                    className='w-full h-full'
                  />
                </div>
              )}
              <div className='flex flex-col gap-0.5 min-w-0'>
                <span className='font-body text-sm text-fg truncate'>{preview.title}</span>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-xs text-fg'>
                    {formatSeconds(preview.duration)}
                  </span>
                  {preview.sourceName && (
                    <span className='font-mono text-[10px] text-faint uppercase'>
                      {preview.sourceName}
                    </span>
                  )}
                  {preview.isPlaylist && (
                    <span className='font-mono text-[10px] text-accent uppercase'>
                      Playlist ({preview.playlistMeta?.videoCount ?? '?'} tracks)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Title / Nickname */}
            <Field
              id='add-title'
              label='Title'
              value={nickname}
              onChange={setNickname}
              placeholder={preview.title}
            />

            <Field
              label='Artist'
              value={artist}
              onChange={setArtist}
              placeholder='Artist name'
              id='add-artist'
            />

            <Field
              label='Album'
              value={album}
              onChange={setAlbum}
              placeholder='Album name'
              id='add-album'
            />

            <Field
              label='Artwork URL'
              value={artwork}
              onChange={setArtwork}
              placeholder='https://example.com/artwork.jpg'
              id='add-artwork'
            />

            {/* Tags */}
            <div>
              <label
                htmlFor='add-tag-input'
                className='block font-mono text-[10px] text-muted uppercase mb-1'
              >
                Tags
              </label>
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: container click focuses inner input */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: container click focuses inner input */}
              <div
                className='input text-sm flex flex-wrap gap-1.5 items-center min-h-9.5 cursor-text'
                onClick={() => document.getElementById('add-tag-input')?.focus()}
              >
                {tags.map((tag) => {
                  const c = getTagColorClasses(tag, tagColorMap[tag.toLowerCase()]);
                  return (
                    <span
                      key={tag}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono ${c.bg} ${c.text} border ${c.border}`}
                    >
                      {tag}
                      <button
                        type='button'
                        className='ml-0.5 opacity-70 hover:opacity-100'
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTag(tag);
                        }}
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}
                <input
                  id='add-tag-input'
                  className='flex-1 min-w-20 bg-transparent outline-none text-sm text-fg placeholder:text-faint'
                  placeholder={tags.length === 0 ? 'Custom grouping (enter to confirm)' : ''}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
              </div>
            </div>

            {/* Volume Boost */}
            <div>
              <span className='block font-mono text-[10px] text-muted uppercase mb-1'>
                Volume Boost
              </span>
              <div className='flex items-center gap-3'>
                <input
                  id='add-volume-boost'
                  className='input text-sm w-16 text-center'
                  type='text'
                  value={volumeBoost}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^-?\d*$/.test(v)) setVolumeBoost(v);
                  }}
                  onBlur={() => {
                    if (volumeBoost.trim() === '' || volumeBoost === '-') {
                      setVolumeBoost('0');
                    } else {
                      const n = parseInt(volumeBoost, 10);
                      if (!Number.isNaN(n)) {
                        setVolumeBoost(String(Math.min(200, Math.max(-100, n))));
                      }
                    }
                  }}
                />
                <span className='text-xs text-muted font-mono w-8 text-left'>%</span>
                <input
                  type='range'
                  min={-100}
                  max={200}
                  value={
                    volumeBoost.trim() === '' || volumeBoost === '-'
                      ? 0
                      : Math.min(200, Math.max(-100, parseInt(volumeBoost, 10) || 0))
                  }
                  onChange={(e) => setVolumeBoost(e.target.value)}
                  className='volume-range-input'
                  style={
                    {
                      ['--volume-pct' as string]: `${
                        ((Math.min(200, Math.max(-100, parseInt(volumeBoost, 10) || 0)) + 100) /
                          300) *
                        100
                      }%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            </div>

            {/* Notify DM */}
            <label className='flex items-center gap-2 cursor-pointer'>
              <Checkbox checked={notifyDm} onChange={setNotifyDm} />
              <span className='font-mono text-xs text-fg'>DM me when this request is reviewed</span>
            </label>

            {error && <p className='font-mono text-xs text-danger'>{error}</p>}

            {loading && (
              <p className='font-mono text-xs text-muted flex items-center gap-2'>
                <Spinner />
                submitting request...
              </p>
            )}

            <div className='flex gap-2 justify-end mt-1'>
              <Button
                variant='inherit'
                onClick={handleBackToUrl}
                disabled={loading}
                surface='surface'
              >
                Back
              </Button>
              <Button variant='primary' onClick={handleSubmit} disabled={!canSubmit}>
                Submit Request
              </Button>
            </div>
          </div>
        )}

        {successMsg && <p className='font-mono text-xs text-success mt-3'>{successMsg}</p>}
      </div>
    </Backdrop>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className='block font-mono text-[10px] text-muted uppercase mb-1'>
        {label}
      </label>
      <input
        id={id}
        className='input text-sm'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
