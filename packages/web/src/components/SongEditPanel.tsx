import type { Song } from '@alfira/server/shared';
import type { SongUpdateData, TagItem } from '@alfira/server/shared/api';
import { fetchTags, updateSong } from '@alfira/server/shared/api';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useTagColors } from '../context/TagsContext';
import { getTagColorClasses } from '../utils/tagColors';

interface SongEditPanelProps {
  song: Song;
  isOpen: boolean;
  onClose: () => void;
}

export default function SongEditPanel({ song, isOpen, onClose }: SongEditPanelProps) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const { tagColorMap } = useTagColors();

  useLayoutEffect(() => {
    if (isOpen) {
      closingRef.current = false;
      setClosing(false);
    } else if (!closingRef.current) {
      closingRef.current = true;
      setClosing(true);
      setTimeout(() => {
        closingRef.current = false;
        setClosing(false);
      }, 300);
    }
  }, [isOpen]);

  const songExtended = song as Song & {
    artist?: string | null;
    album?: string | null;
    artwork?: string | null;
    tags?: string[];
  };
  const [nickname, setNickname] = useState(song.nickname ?? '');
  const [artist, setArtist] = useState(songExtended.artist ?? '');
  const [album, setAlbum] = useState(songExtended.album ?? '');
  const [artwork, setArtwork] = useState(songExtended.artwork ?? '');
  const [tags, setTags] = useState<string[]>(songExtended.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [volumeBoost, setVolumeBoost] = useState(
    songExtended.volumeBoost != null ? String(songExtended.volumeBoost) : '0'
  );
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);
  const [fetchedTags, setFetchedTags] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Refs for save logic so we don't recreate handlers on every render
  const songIdRef = useRef(song.id);
  songIdRef.current = song.id;
  const fieldsRef = useRef(() => ({ nickname, artist, album, artwork, tags, volumeBoost }));
  fieldsRef.current = () => ({ nickname, artist, album, artwork, tags, volumeBoost });
  const originalNicknameRef = useRef<string | null>(songExtended.nickname ?? null);
  originalNicknameRef.current = songExtended.nickname ?? null;
  const originalArtistRef = useRef<string | null>(songExtended.artist ?? null);
  originalArtistRef.current = songExtended.artist ?? null;
  const originalAlbumRef = useRef<string | null>(songExtended.album ?? null);
  originalAlbumRef.current = songExtended.album ?? null;
  const originalArtworkRef = useRef<string | null>(songExtended.artwork ?? null);
  originalArtworkRef.current = songExtended.artwork ?? null;
  const originalTagsRef = useRef<string[]>(songExtended.tags ?? []);
  originalTagsRef.current = songExtended.tags ?? [];
  const originalVolumeBoostRef = useRef<number | null>(songExtended.volumeBoost ?? null);
  originalVolumeBoostRef.current = songExtended.volumeBoost ?? null;
  const savingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      savingRef.current = false;
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) {
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const filteredTags = availableTags.filter(
        (t) =>
          tagInput.trim() === '' ||
          t.canonicalName.toLowerCase().includes(tagInput.toLowerCase()) ||
          t.nameLower.includes(tagInput.toLowerCase())
      );
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showTagDropdown && highlightedIndex >= 0 && filteredTags[highlightedIndex]) {
          const tag = filteredTags[highlightedIndex];
          if (tags.includes(tag.canonicalName)) {
            removeTag(tag.canonicalName);
          } else {
            setTags((prev) => [...prev, tag.canonicalName]);
          }
          setTagInput('');
          setHighlightedIndex(-1);
        } else {
          addTag();
        }
      }
      if (e.key === 'ArrowDown' && showTagDropdown) {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filteredTags.length - 1));
      }
      if (e.key === 'ArrowUp' && showTagDropdown) {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Escape' && showTagDropdown) {
        setShowTagDropdown(false);
        setHighlightedIndex(-1);
      }
      if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      }
    },
    [addTag, availableTags, highlightedIndex, removeTag, showTagDropdown, tagInput, tags]
  );

  const doSave = useCallback(async () => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      const {
        nickname: nk,
        artist: ar,
        album: al,
        artwork: aw,
        tags: t,
        volumeBoost: vo,
      } = fieldsRef.current();
      const parsedRaw = vo.trim() === '' ? null : parseInt(vo.trim(), 10);
      const parsedBoost =
        parsedRaw != null && !Number.isNaN(parsedRaw) && parsedRaw !== 0 ? parsedRaw : null;

      // Build a partial update — only include fields that actually changed.
      // This prevents concurrent edits from clobbering each other (last-write-wins).
      const data: SongUpdateData = {};
      if (nk !== (originalNicknameRef.current ?? '')) {
        data.nickname = nk.trim() || null;
      }
      if (ar !== (originalArtistRef.current ?? '')) {
        data.artist = ar.trim() || null;
      }
      if (al !== (originalAlbumRef.current ?? '')) {
        data.album = al.trim() || null;
      }
      if (aw !== (originalArtworkRef.current ?? '')) {
        data.artwork = aw.trim() || null;
      }
      if (JSON.stringify(t) !== JSON.stringify(originalTagsRef.current)) {
        data.tags = t;
      }
      if (parsedBoost !== originalVolumeBoostRef.current) {
        data.volumeBoost = parsedBoost;
      }

      // Skip if nothing changed
      if (Object.keys(data).length === 0) {
        onCloseRef.current();
        return;
      }

      await updateSong(songIdRef.current, data);
      onCloseRef.current();
    } finally {
      savingRef.current = false;
    }
  }, []);

  // Save when `isOpen` goes to false (e.g. user clicks the parent row to close)
  useEffect(() => {
    if (!isOpen && !savingRef.current) {
      const {
        nickname: nk,
        artist: ar,
        album: al,
        artwork: aw,
        tags: t,
        volumeBoost: vo,
      } = fieldsRef.current();
      const parsedRaw = vo.trim() === '' ? null : parseInt(vo.trim(), 10);
      const parsedBoost =
        parsedRaw != null && !Number.isNaN(parsedRaw) && parsedRaw !== 0 ? parsedRaw : null;

      const data: SongUpdateData = {};
      if (nk !== (originalNicknameRef.current ?? '')) {
        data.nickname = nk.trim() || null;
      }
      if (ar !== (originalArtistRef.current ?? '')) {
        data.artist = ar.trim() || null;
      }
      if (al !== (originalAlbumRef.current ?? '')) {
        data.album = al.trim() || null;
      }
      if (aw !== (originalArtworkRef.current ?? '')) {
        data.artwork = aw.trim() || null;
      }
      if (JSON.stringify(t) !== JSON.stringify(originalTagsRef.current)) {
        data.tags = t;
      }
      if (parsedBoost !== originalVolumeBoostRef.current) {
        data.volumeBoost = parsedBoost;
      }

      if (Object.keys(data).length > 0) {
        void doSave();
      }
    }
  }, [isOpen, doSave]);

  if (!isOpen && !closing) {
    return null;
  }

  return (
    <div
      className='expand-panel-content'
      data-closing={closing ? 'true' : undefined}
      style={closing ? { pointerEvents: 'none' } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className='px-3 md:px-4 pt-4 pb-4 border-t border-border'>
        <div className='flex flex-col gap-3'>
          <Field
            id='panel-name'
            label='Name'
            value={nickname}
            onChange={setNickname}
            inputRef={inputRef}
            placeholder={song.title}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void doSave();
              }
            }}
          />
          <Field
            id='panel-artist'
            label='Artist'
            value={artist}
            onChange={setArtist}
            placeholder='Artist name'
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void doSave();
              }
            }}
          />
          <Field
            id='panel-album'
            label='Album'
            value={album}
            onChange={setAlbum}
            placeholder='Album name'
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void doSave();
              }
            }}
          />
          <Field
            id='panel-artwork'
            label='Artwork URL'
            value={artwork}
            onChange={setArtwork}
            placeholder={song.thumbnailUrl}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void doSave();
              }
            }}
          />

          {/* Tags */}
          <div>
            <label
              htmlFor='panel-tag-input'
              className='block font-mono text-[10px] text-muted uppercase mb-1'
            >
              Tags
            </label>
            <div
              className='input text-sm flex flex-wrap gap-1.5 items-center min-h-9.5 cursor-text relative'
              onClick={() => {
                tagInputRef.current?.focus();
                if (!fetchedTags) {
                  void (async () => {
                    const t = await fetchTags();
                    setAvailableTags(t);
                    setFetchedTags(true);
                  })();
                }
                setShowTagDropdown(true);
              }}
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
                      onClick={() => removeTag(tag)}
                    >
                      &times;
                    </button>
                  </span>
                );
              })}
              <input
                id='panel-tag-input'
                ref={tagInputRef}
                className='flex-1 min-w-20 bg-transparent outline-none text-sm text-fg placeholder:text-faint'
                placeholder={tags.length === 0 ? 'Custom grouping (enter to confirm)' : ''}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
              />
              {showTagDropdown && (
                <TagDropdown
                  availableTags={availableTags}
                  tagInput={tagInput}
                  tags={tags}
                  highlightedIndex={highlightedIndex}
                  onToggle={(tag) => {
                    if (tags.includes(tag)) {
                      removeTag(tag);
                    } else {
                      flushSync(() => setTags((prev) => [...prev, tag]));
                    }
                  }}
                  onHighlight={setHighlightedIndex}
                  onClose={() => {
                    setShowTagDropdown(false);
                    setHighlightedIndex(-1);
                  }}
                  tagInputRef={tagInputRef}
                  onTagInputChange={setTagInput}
                />
              )}
            </div>
          </div>

          <VolumeSlider
            value={volumeBoost}
            onChange={setVolumeBoost}
            min={-100}
            max={200}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void doSave();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

function VolumeSlider({
  value,
  onChange,
  min,
  max,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const numeric = value.trim() === '' ? 0 : Math.min(max, Math.max(min, parseInt(value, 10) || 0));
  const pct = `${((numeric - min) / (max - min)) * 100}%`;

  return (
    <div>
      <span className='block font-mono text-[10px] text-muted uppercase mb-1'>Volume Boost</span>
      <div className='flex items-center gap-3'>
        <input
          id='panel-volume-boost'
          className='input text-sm w-16 text-center'
          type='text'
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || /^\d*$/.test(v)) {
              onChange(v);
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (value.trim() === '') {
              onChange('0');
            } else {
              const n = parseInt(value, 10);
              if (!Number.isNaN(n)) {
                onChange(String(Math.min(max, Math.max(min, n))));
              }
            }
          }}
        />
        <span className='text-xs text-muted font-mono w-8 text-left'>%</span>
        <input
          type='range'
          min={min}
          max={max}
          value={numeric}
          onChange={(e) => onChange(e.target.value)}
          className='volume-range-input min-w-0'
          style={
            {
              ['--volume-pct' as string]: pct,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputRef,
  onKeyDown,
  type,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className='block font-mono text-[10px] text-muted uppercase mb-1'>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        className='input text-sm'
        type={type}
        min={type === 'number' ? min : undefined}
        max={type === 'number' ? max : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width='14'
      height='14'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='3'
      strokeLinecap='round'
      strokeLinejoin='round'
      className='text-green-400 inline-block'
      aria-label='Added'
    >
      <title>Added</title>
      <polyline points='20 6 9 17 4 12' />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width='14'
      height='14'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      className='text-muted inline-block'
      aria-label='Not added'
    >
      <title>Not added</title>
      <line x1='18' y1='6' x2='6' y2='18' />
      <line x1='6' y1='6' x2='18' y2='18' />
    </svg>
  );
}

interface TagDropdownProps {
  availableTags: TagItem[];
  tagInput: string;
  tags: string[];
  highlightedIndex: number;
  onToggle: (tag: string) => void;
  onHighlight: (index: number) => void;
  onClose: () => void;
  tagInputRef: React.RefObject<HTMLInputElement | null>;
  onTagInputChange: (value: string) => void;
}

function TagDropdown({
  availableTags,
  tagInput,
  tags,
  highlightedIndex,
  onToggle,
  onHighlight,
  onClose,
  tagInputRef,
  onTagInputChange,
}: TagDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!dropdownRef.current) {
      return;
    }
    const input = tagInputRef.current;
    if (!input) {
      return;
    }
    const rect = input.getBoundingClientRect();
    dropdownRef.current.style.top = `${rect.bottom + window.scrollY + 4}px`;
    dropdownRef.current.style.left = `${rect.left + window.scrollX}px`;
  }, [tagInputRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const tagWrapper = document.getElementById('panel-tag-input')?.parentElement;
      const dropdown = dropdownRef.current;
      if (
        tagWrapper &&
        !tagWrapper.contains(e.target as Node) &&
        dropdown &&
        !dropdown.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = availableTags.filter(
    (t) =>
      tagInput.trim() === '' ||
      t.canonicalName.toLowerCase().includes(tagInput.toLowerCase()) ||
      t.nameLower.includes(tagInput.toLowerCase())
  );

  const dropdown = (
    <div
      ref={dropdownRef}
      className='fixed z-50 min-w-45 glass-popover max-h-48'
      style={{ top: 0, left: 0 }}
    >
      {filtered.length === 0 ? (
        <div className='px-3 py-2 text-xs text-muted cursor-default'>
          {availableTags.length === 0 ? 'No tags yet' : 'No matches'}
        </div>
      ) : (
        filtered.map((tag, i) => {
          const isAdded = tags.includes(tag.canonicalName);
          const c = getTagColorClasses(tag.canonicalName);
          return (
            <div
              key={tag.nameLower}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                i === highlightedIndex ? 'bg-elevated' : 'hover:bg-elevated/70'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle(tag.canonicalName);
                onTagInputChange('');
                tagInputRef.current?.focus();
              }}
              onMouseEnter={() => onHighlight(i)}
            >
              <span className={`font-mono text-xs ${c.text}`}>{tag.canonicalName}</span>
              <span className='ml-auto text-muted text-xs'>
                {isAdded ? <CheckIcon /> : <CrossIcon />}
              </span>
            </div>
          );
        })
      )}
    </div>
  );

  return createPortal(dropdown, document.body);
}
