import { type Song } from '@alfira/server/shared';
import { type SongUpdateData, type TagItem } from '@alfira/server/shared/api';
import { fetchTags, updateSong } from '@alfira/server/shared/api';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
        removeTag(tags[tags.length - 1]!);
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
      const parsedRaw = vo.trim() === '' ? null : Math.trunc(Number(vo.trim()));
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
      const parsedRaw = vo.trim() === '' ? null : Math.trunc(Number(vo.trim()));
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

  const handleEnterSave = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void doSave();
      }
    },
    [doSave]
  );

  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const panelStyle = useMemo(
    () => (closing ? ({ pointerEvents: 'none' } as const) : undefined),
    [closing]
  );

  const handleFocusTagInput = useCallback(() => {
    tagInputRef.current?.focus();
    if (!fetchedTags) {
      void (async () => {
        const t = await fetchTags();
        setAvailableTags(t);
        setFetchedTags(true);
      })();
    }
    setShowTagDropdown(true);
  }, [fetchedTags]);

  const handleTagPillRemove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const tag = e.currentTarget.closest<HTMLElement>('[data-tag]')?.dataset.tag;
      if (tag) {
        removeTag(tag);
      }
    },
    [removeTag]
  );

  const handleTagInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value);
  }, []);

  const handleTagToggle = useCallback(
    (tag: string) => {
      if (tags.includes(tag)) {
        removeTag(tag);
      } else {
        flushSync(() => {
          setTags((prev) => [...prev, tag]);
        });
      }
    },
    [tags, removeTag]
  );

  const handleTagDropdownClose = useCallback(() => {
    setShowTagDropdown(false);
    setHighlightedIndex(-1);
  }, []);

  if (!isOpen && !closing) {
    return null;
  }

  return (
    <div
      className='expand-panel-content'
      data-closing={closing ? 'true' : undefined}
      style={panelStyle}
      onClick={handlePanelClick}
    >
      <div className='border-border border-t px-3 pt-4 pb-4 md:px-4'>
        <div className='flex flex-col gap-3'>
          <Field
            id='panel-name'
            label='Name'
            value={nickname}
            onChange={setNickname}
            inputRef={inputRef}
            placeholder={song.title}
            onKeyDown={handleEnterSave}
          />
          <Field
            id='panel-artist'
            label='Artist'
            value={artist}
            onChange={setArtist}
            placeholder='Artist name'
            onKeyDown={handleEnterSave}
          />
          <Field
            id='panel-album'
            label='Album'
            value={album}
            onChange={setAlbum}
            placeholder='Album name'
            onKeyDown={handleEnterSave}
          />
          <Field
            id='panel-artwork'
            label='Artwork URL'
            value={artwork}
            onChange={setArtwork}
            placeholder={song.thumbnailUrl}
            onKeyDown={handleEnterSave}
          />

          {/* Tags */}
          <div>
            <label
              htmlFor='panel-tag-input'
              className='text-muted mb-1 block font-mono text-[10px] uppercase'
            >
              Tags
            </label>
            <div
              className='input relative flex min-h-9.5 cursor-text flex-wrap items-center gap-1.5 text-sm'
              onClick={handleFocusTagInput}
            >
              {tags.map((tag) => {
                const c = getTagColorClasses(tag, tagColorMap[tag.toLowerCase()]);
                return (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs ${c.bg} ${c.text} border ${c.border}`}
                  >
                    {tag}
                    <button
                      type='button'
                      className='ml-0.5 opacity-70 hover:opacity-100'
                      onClick={handleTagPillRemove}
                      data-tag={tag}
                    >
                      &times;
                    </button>
                  </span>
                );
              })}
              <input
                id='panel-tag-input'
                ref={tagInputRef}
                className='text-fg placeholder:text-faint min-w-20 flex-1 bg-transparent text-sm outline-none'
                placeholder={tags.length === 0 ? 'Custom grouping (enter to confirm)' : ''}
                value={tagInput}
                onChange={handleTagInputChange}
                onKeyDown={handleTagKeyDown}
              />
              {showTagDropdown && (
                <TagDropdown
                  availableTags={availableTags}
                  tagInput={tagInput}
                  tags={tags}
                  highlightedIndex={highlightedIndex}
                  onToggle={handleTagToggle}
                  onHighlight={setHighlightedIndex}
                  onClose={handleTagDropdownClose}
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
            onKeyDown={handleEnterSave}
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
  const numeric =
    value.trim() === '' ? 0 : Math.min(max, Math.max(min, Math.trunc(Number(value)) || 0));
  const pct = `${((numeric - min) / (max - min)) * 100}%`;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (v === '' || /^\d*$/.test(v)) {
        onChange(v);
      }
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    if (value.trim() === '') {
      onChange('0');
    } else {
      const n = Math.trunc(Number(value));
      if (!Number.isNaN(n)) {
        onChange(String(Math.min(max, Math.max(min, n))));
      }
    }
  }, [value, onChange, min, max]);

  const handleRangeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const rangeStyle = useMemo(
    () =>
      ({
        '--volume-pct': pct,
      }) as React.CSSProperties,
    [pct]
  );

  return (
    <div>
      <span className='text-muted mb-1 block font-mono text-[10px] uppercase'>Volume Boost</span>
      <div className='flex items-center gap-3'>
        <input
          id='panel-volume-boost'
          className='input w-16 text-center text-sm'
          type='text'
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onBlur={handleBlur}
        />
        <span className='text-muted w-8 text-left font-mono text-xs'>%</span>
        <input
          type='range'
          min={min}
          max={max}
          value={numeric}
          onChange={handleRangeChange}
          className='volume-range-input min-w-0'
          style={rangeStyle}
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
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );
  return (
    <div>
      <label htmlFor={id} className='text-muted mb-1 block font-mono text-[10px] uppercase'>
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
        onChange={handleChange}
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
      className='inline-block text-green-400'
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

const TAG_DROPDOWN_PLACEHOLDER_STYLE: React.CSSProperties = { top: 0, left: 0 };

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
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const filtered = availableTags.filter(
    (t) =>
      tagInput.trim() === '' ||
      t.canonicalName.toLowerCase().includes(tagInput.toLowerCase()) ||
      t.nameLower.includes(tagInput.toLowerCase())
  );

  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = e.currentTarget.dataset.tag;
      if (tag) {
        onToggle(tag);
      }
      onTagInputChange('');
      tagInputRef.current?.focus();
    },
    [onToggle, onTagInputChange, tagInputRef]
  );

  const handleItemMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const idx = Math.trunc(Number(e.currentTarget.dataset.index ?? '0'));
      onHighlight(idx);
    },
    [onHighlight]
  );

  const dropdown = (
    <div
      ref={dropdownRef}
      className='glass-popover fixed z-50 max-h-48 min-w-45'
      style={TAG_DROPDOWN_PLACEHOLDER_STYLE}
    >
      {filtered.length === 0 ? (
        <div className='text-muted cursor-default px-3 py-2 text-xs'>
          {availableTags.length === 0 ? 'No tags yet' : 'No matches'}
        </div>
      ) : (
        filtered.map((tag, i) => {
          const isAdded = tags.includes(tag.canonicalName);
          const c = getTagColorClasses(tag.canonicalName);
          return (
            <div
              key={tag.nameLower}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                i === highlightedIndex ? 'bg-elevated' : 'hover:bg-elevated/70'
              }`}
              onMouseDown={handleItemMouseDown}
              data-tag={tag.canonicalName}
              onMouseEnter={handleItemMouseEnter}
              data-index={i}
            >
              <span className={`font-mono text-xs ${c.text}`}>{tag.canonicalName}</span>
              <span className='text-muted ml-auto text-xs'>
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
