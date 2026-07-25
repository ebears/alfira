import { type BulkEditData, fetchTags, type TagItem } from '@alfira/server/shared/api';
import { EraserIcon, XIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTagColors } from '../context/TagsContext';
import { getTagColorClasses } from '../utils/tagColors';
import { Backdrop } from './Backdrop';
import { Button } from './ui/Button';
import { SpringUp } from './ui/SpringUp';

interface BulkEditModalProps {
  count: number;
  onApply: (data: BulkEditData) => void;
  onClose: () => void;
  isApplying?: boolean;
}

type TextEditableField = 'nickname' | 'artist' | 'album' | 'artwork';

const EDITABLE_FIELDS: { key: TextEditableField; label: string; placeholder: string }[] = [
  { key: 'nickname', label: 'Nickname', placeholder: 'Custom display name' },
  { key: 'artist', label: 'Artist', placeholder: 'Artist name' },
  { key: 'album', label: 'Album', placeholder: 'Album name' },
  { key: 'artwork', label: 'Artwork URL', placeholder: 'https://example.com/artwork.jpg' },
];

export default function BulkEditModal({ count, onApply, onClose, isApplying }: BulkEditModalProps) {
  const { tagColorMap } = useTagColors();

  // Text fields
  const [nickname, setNickname] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [artwork, setArtwork] = useState('');

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagAreaRef = useRef<HTMLDivElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Close tag dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        tagAreaRef.current &&
        !tagAreaRef.current.contains(target) &&
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [showDropdown]);

  // Volume boost
  const [volumeBoost, setVolumeBoost] = useState('');

  // Clear toggles
  const [clearFields, setClearFields] = useState<Set<string>>(new Set());

  // Fetch available tags on mount
  useEffect(() => {
    void (async () => {
      try {
        const tags = await fetchTags();
        setAvailableTags(tags);
      } catch {
        // Non-critical
      }
    })();
  }, []);

  const filtered = availableTags.filter(
    (t) =>
      tagInput.trim() === '' ||
      t.canonicalName.toLowerCase().includes(tagInput.toLowerCase()) ||
      t.nameLower.includes(tagInput.toLowerCase())
  );

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) {
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
    setHighlightedIdx(0);
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showDropdown && highlightedIdx >= 0 && filtered[highlightedIdx]) {
          const tag = filtered[highlightedIdx].nameLower;
          if (!tags.includes(tag)) {
            setTags((prev) => [...prev, tag]);
          }
          setTagInput('');
          setHighlightedIdx(0);
        } else {
          addTag();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
      }
    },
    [showDropdown, highlightedIdx, filtered, tags, addTag]
  );

  const toggleClear = useCallback((field: string) => {
    setClearFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);

  // Volume boost slider derived values
  const volumeNumeric =
    volumeBoost.trim() === '' || volumeBoost.trim() === '-'
      ? 0
      : Math.min(200, Math.max(-100, Math.trunc(Number(volumeBoost)) || 0));
  const volumePct = `${((volumeNumeric - -100) / (200 - -100)) * 100}%`;

  const fieldValues: Record<TextEditableField, string> = { nickname, artist, album, artwork };

  const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const field = e.currentTarget.dataset.field as TextEditableField;
    const value = e.target.value;
    switch (field) {
      case 'nickname':
        setNickname(value);
        break;
      case 'artist':
        setArtist(value);
        break;
      case 'album':
        setAlbum(value);
        break;
      case 'artwork':
        setArtwork(value);
        break;
    }
  }, []);

  const handleClearField = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const field = e.currentTarget.dataset.field;
      if (field) {
        toggleClear(field);
      }
    },
    [toggleClear]
  );

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleFocusTagInput = useCallback(() => {
    tagInputRef.current?.focus();
    setShowDropdown(true);
  }, []);

  const handleTagPillRemove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const tag = e.currentTarget.closest<HTMLElement>('[data-tag]')?.dataset.tag;
      if (tag) {
        removeTag(tag);
      }
    },
    [removeTag]
  );

  const handleTagInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value);
    setShowDropdown(true);
    setHighlightedIdx(0);
  }, []);

  const handleTagInputFocus = useCallback(() => {
    setShowDropdown(true);
  }, []);

  const handleClearTags = useCallback(() => {
    toggleClear('tags');
  }, [toggleClear]);

  const handleDropdownSelect = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const tagNameLower = e.currentTarget.dataset.tag;
      if (tagNameLower && !tags.includes(tagNameLower)) {
        setTags((prev) => [...prev, tagNameLower]);
      }
      setTagInput('');
      setHighlightedIdx(0);
      setShowDropdown(false);
      tagInputRef.current?.focus();
    },
    [tags]
  );

  const handleVolumeTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '' || /^-?\d*$/.test(v)) {
      setVolumeBoost(v);
    }
  }, []);

  const handleVolumeBlur = useCallback(() => {
    if (volumeBoost.trim() === '' || volumeBoost.trim() === '-') {
      setVolumeBoost('0');
    } else {
      const n = Math.trunc(Number(volumeBoost));
      if (!Number.isNaN(n)) {
        setVolumeBoost(String(Math.min(200, Math.max(-100, n))));
      }
    }
  }, [volumeBoost]);

  const handleVolumeRangeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolumeBoost(e.target.value);
  }, []);

  const handleClearVolumeBoost = useCallback(() => {
    toggleClear('volumeBoost');
  }, [toggleClear]);

  const volumeRangeStyle = useMemo(
    () => ({ '--volume-pct': volumePct }) as React.CSSProperties,
    [volumePct]
  );

  const handleApply = useCallback(() => {
    const data: BulkEditData = {};
    let hasChanges = false;

    // Text fields: include if non-empty or marked for clear
    const textFields: { key: keyof BulkEditData; value: string }[] = [
      { key: 'nickname', value: nickname },
      { key: 'artist', value: artist },
      { key: 'album', value: album },
      { key: 'artwork', value: artwork },
    ];

    for (const { key, value } of textFields) {
      if (clearFields.has(key)) {
        (data as Record<string, unknown>)[key] = null;
        hasChanges = true;
      } else if (value.trim()) {
        (data as Record<string, unknown>)[key] = value.trim();
        hasChanges = true;
      }
    }

    // Tags: include if non-empty or marked for clear
    if (clearFields.has('tags')) {
      data.tags = [];
      hasChanges = true;
    } else if (tags.length > 0) {
      data.tags = tags;
      hasChanges = true;
    }

    // Volume boost
    if (clearFields.has('volumeBoost')) {
      data.volumeBoost = null;
      hasChanges = true;
    } else if (volumeBoost.trim()) {
      const parsed = Number(volumeBoost.trim());
      if (!Number.isNaN(parsed)) {
        data.volumeBoost = parsed;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return;
    }

    // Include clearFields for the backend
    if (clearFields.size > 0) {
      data.clearFields = [...clearFields];
    }

    onApply(data);
  }, [nickname, artist, album, artwork, tags, volumeBoost, clearFields, onApply]);

  return (
    <Backdrop onClose={onClose}>
      <SpringUp
        className='glass-modal mx-4 max-h-[85vh] w-full max-w-md overflow-y-auto p-6'
        onClick={handleBackdropClick}
      >
        <h2 className='font-display text-fg mb-1 text-lg'>Edit {count} songs</h2>
        <p className='text-muted mb-4 font-mono text-xs'>
          Fill in fields you want to change. Blank fields are left unchanged. Use clear to reset a
          field.
        </p>

        <div className='flex flex-col gap-3'>
          {EDITABLE_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className='flex items-start gap-2'>
              <div className='flex-1'>
                <label
                  htmlFor={`bulk-edit-${key}`}
                  className='text-muted mb-1 block font-mono text-[10px] uppercase'
                >
                  {label}
                </label>
                <input
                  id={`bulk-edit-${key}`}
                  className={`input text-sm w-full${clearFields.has(key) ? ' pointer-events-none opacity-30' : ''}`}
                  placeholder={placeholder}
                  value={fieldValues[key]}
                  onChange={handleFieldChange}
                  data-field={key}
                  disabled={clearFields.has(key)}
                />
              </div>
              <label className='flex shrink-0 cursor-pointer flex-col items-center gap-0.5 pt-5'>
                <input
                  type='checkbox'
                  className='peer sr-only'
                  checked={clearFields.has(key)}
                  onChange={handleClearField}
                  data-field={key}
                />
                <span className='text-muted peer-checked:text-danger font-mono text-[9px] uppercase transition-colors'>
                  Clear
                </span>
                <EraserIcon
                  size={12}
                  weight='duotone'
                  className='text-muted peer-checked:text-danger transition-colors'
                />
              </label>
            </div>
          ))}

          {/* Tags field */}
          <div>
            <div className='flex items-start gap-2'>
              <div className='flex-1'>
                <label
                  htmlFor='bulk-edit-tags'
                  className='text-muted mb-1 block font-mono text-[10px] uppercase'
                >
                  Tags
                </label>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- container click focuses inner input */}
                <div
                  ref={tagAreaRef}
                  className={`input flex min-h-9.5 cursor-text flex-wrap items-center gap-1.5 text-sm relative${clearFields.has('tags') ? ' pointer-events-none opacity-30' : ''}`}
                  onClick={handleFocusTagInput}
                >
                  {tags.map((tag) => {
                    const c = getTagColorClasses(tag, tagColorMap[tag.toLowerCase()]);
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${c.bg} ${c.text} ${c.border} border`}
                      >
                        {tag}
                        <button
                          type='button'
                          className='cursor-pointer opacity-60 hover:opacity-100'
                          onClick={handleTagPillRemove}
                          data-tag={tag}
                        >
                          <XIcon size={10} weight='bold' />
                        </button>
                      </span>
                    );
                  })}
                  <input
                    ref={tagInputRef}
                    id='bulk-edit-tags'
                    className='placeholder:text-faint min-w-30 flex-1 bg-transparent py-0.5 text-sm outline-none'
                    placeholder={
                      tags.length === 0 ? 'Type a tag and press Enter...' : 'Add another...'
                    }
                    value={tagInput}
                    onChange={handleTagInputChange}
                    onFocus={handleTagInputFocus}
                    onKeyDown={handleTagKeyDown}
                    disabled={clearFields.has('tags')}
                  />
                </div>
              </div>
              <label className='flex shrink-0 cursor-pointer flex-col items-center gap-0.5 pt-5'>
                <input
                  type='checkbox'
                  className='peer sr-only'
                  checked={clearFields.has('tags')}
                  onChange={handleClearTags}
                />
                <span className='text-muted peer-checked:text-danger font-mono text-[9px] uppercase transition-colors'>
                  Clear
                </span>
                <EraserIcon
                  size={12}
                  weight='duotone'
                  className='text-muted peer-checked:text-danger transition-colors'
                />
              </label>
            </div>

            {/* Tag suggestions dropdown */}
            {showDropdown && filtered.length > 0 && (
              <div className='relative'>
                <div
                  ref={tagDropdownRef}
                  className='glass-popover absolute top-1 right-0 left-0 z-30 max-h-40'
                >
                  {filtered.map((t, i) => {
                    const c = getTagColorClasses(t.canonicalName, t.color);
                    return (
                      <button
                        key={t.nameLower}
                        type='button'
                        className={`w-full cursor-pointer px-3 py-1.5 text-left text-sm transition-colors ${
                          i === highlightedIdx
                            ? 'bg-accent/10 text-accent'
                            : 'text-fg hover:bg-surface'
                        }`}
                        onMouseDown={handleDropdownSelect}
                        data-tag={t.nameLower}
                      >
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}
                        >
                          {t.canonicalName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Volume boost field */}
          <div className='flex items-start gap-2'>
            <div className='flex-1'>
              <label
                htmlFor='bulk-edit-volumeboost'
                className='text-muted mb-1 block font-mono text-[10px] uppercase'
              >
                Volume Boost (dB)
              </label>
              <div className='flex items-center gap-3'>
                <input
                  id='bulk-edit-volumeboost'
                  className='input w-16 text-center text-sm disabled:cursor-not-allowed disabled:opacity-30'
                  placeholder='0'
                  type='text'
                  value={volumeBoost}
                  onChange={handleVolumeTextChange}
                  onBlur={handleVolumeBlur}
                  disabled={clearFields.has('volumeBoost')}
                />
                <span className='text-muted w-8 text-left font-mono text-xs'>dB</span>
                <input
                  type='range'
                  min={-100}
                  max={200}
                  value={volumeNumeric}
                  onChange={handleVolumeRangeChange}
                  className={`volume-range-input${clearFields.has('volumeBoost') ? ' pointer-events-none opacity-30' : ''}`}
                  disabled={clearFields.has('volumeBoost')}
                  style={volumeRangeStyle}
                />
              </div>
            </div>
            <label className='flex shrink-0 cursor-pointer flex-col items-center gap-0.5 pt-5'>
              <input
                type='checkbox'
                className='peer sr-only'
                checked={clearFields.has('volumeBoost')}
                onChange={handleClearVolumeBoost}
              />
              <span className='text-muted peer-checked:text-danger font-mono text-[9px] uppercase transition-colors'>
                Clear
              </span>
              <EraserIcon
                size={12}
                weight='duotone'
                className='text-muted peer-checked:text-danger transition-colors'
              />
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className='mt-4 flex justify-end gap-2'>
          <Button variant='inherit' surface='surface' onClick={onClose} className='text-xs'>
            Cancel
          </Button>
          <Button variant='primary' onClick={handleApply} disabled={isApplying} className='text-xs'>
            {isApplying ? 'Applying...' : `Apply to ${count} songs`}
          </Button>
        </div>
      </SpringUp>
    </Backdrop>
  );
}
