import { type BulkEditData, fetchTags, type TagItem } from '@alfira-bot/server/shared/api';
import { EraserIcon, XIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTagColors } from '../context/TagsContext';
import { getTagColorClasses } from '../utils/tagColors';
import { Backdrop } from './Backdrop';
import { Button } from './ui/Button';

interface BulkEditModalProps {
  count: number;
  onApply: (data: BulkEditData) => void;
  onClose: () => void;
  isApplying?: boolean;
}

type EditableField = Extract<keyof BulkEditData, string>;

const EDITABLE_FIELDS: { key: EditableField; label: string; placeholder: string }[] = [
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
    if (!showDropdown) return;
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
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // Volume boost
  const [volumeBoost, setVolumeBoost] = useState('');

  // Clear toggles
  const [clearFields, setClearFields] = useState<Set<string>>(new Set());

  // Fetch available tags on mount
  useEffect(() => {
    fetchTags()
      .then(setAvailableTags)
      .catch(() => {
        // Non-critical
      });
  }, []);

  const filtered = availableTags.filter(
    (t) =>
      tagInput.trim() === '' ||
      t.canonicalName.toLowerCase().includes(tagInput.toLowerCase()) ||
      t.nameLower.includes(tagInput.toLowerCase())
  );

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
    setHighlightedIdx(0);
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
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
  };

  const toggleClear = (field: string) => {
    setClearFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  // Volume boost slider derived values
  const volumeNumeric =
    volumeBoost.trim() === '' || volumeBoost.trim() === '-'
      ? 0
      : Math.min(200, Math.max(-100, Number.parseInt(volumeBoost, 10) || 0));
  const volumePct = `${((volumeNumeric - -100) / (200 - -100)) * 100}%`;

  const handleApply = () => {
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
      const parsed = Number.parseFloat(volumeBoost.trim());
      if (!Number.isNaN(parsed)) {
        data.volumeBoost = parsed;
        hasChanges = true;
      }
    }

    if (!hasChanges) return;

    // Include clearFields for the backend
    if (clearFields.size > 0) {
      data.clearFields = [...clearFields];
    }

    onApply(data);
  };

  return (
    <Backdrop onClose={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: modal container, keyboard not applicable */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: modal container, keyboard not applicable */}
      <div
        className="bg-elevated rounded-xl border border-border shadow-2xl w-full max-w-md mx-4 p-6 animate-fade-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg text-fg mb-1">Edit {count} songs</h2>
        <p className="text-xs text-muted font-mono mb-4">
          Fill in fields you want to change. Blank fields are left unchanged. Use clear to reset a
          field.
        </p>

        <div className="flex flex-col gap-3">
          {EDITABLE_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="flex items-start gap-2">
              <div className="flex-1">
                <label
                  htmlFor={`bulk-edit-${key}`}
                  className="block font-mono text-[10px] text-muted uppercase mb-1"
                >
                  {label}
                </label>
                <input
                  id={`bulk-edit-${key}`}
                  className={`input text-sm w-full${clearFields.has(key) ? ' opacity-30 pointer-events-none' : ''}`}
                  placeholder={placeholder}
                  value={(() => {
                    switch (key) {
                      case 'nickname':
                        return nickname;
                      case 'artist':
                        return artist;
                      case 'album':
                        return album;
                      case 'artwork':
                        return artwork;
                      default:
                        return '';
                    }
                  })()}
                  onChange={(e) => {
                    switch (key) {
                      case 'nickname':
                        setNickname(e.target.value);
                        break;
                      case 'artist':
                        setArtist(e.target.value);
                        break;
                      case 'album':
                        setAlbum(e.target.value);
                        break;
                      case 'artwork':
                        setArtwork(e.target.value);
                        break;
                    }
                  }}
                  disabled={clearFields.has(key)}
                />
              </div>
              <label className="flex flex-col items-center gap-0.5 shrink-0 pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={clearFields.has(key)}
                  onChange={() => toggleClear(key)}
                />
                <span className="text-[9px] font-mono uppercase text-muted peer-checked:text-danger transition-colors">
                  Clear
                </span>
                <EraserIcon
                  size={12}
                  weight="duotone"
                  className="text-muted peer-checked:text-danger transition-colors"
                />
              </label>
            </div>
          ))}

          {/* Tags field */}
          <div>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <label
                  htmlFor="bulk-edit-tags"
                  className="block font-mono text-[10px] text-muted uppercase mb-1"
                >
                  Tags
                </label>
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: container click focuses inner input */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: container click focuses inner input */}
                <div
                  ref={tagAreaRef}
                  className={`input text-sm flex flex-wrap gap-1.5 items-center min-h-9.5 cursor-text relative${clearFields.has('tags') ? ' opacity-30 pointer-events-none' : ''}`}
                  onClick={() => {
                    tagInputRef.current?.focus();
                    setShowDropdown(true);
                  }}
                >
                  {tags.map((tag) => {
                    const c = getTagColorClasses(tag, tagColorMap[tag.toLowerCase()]);
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text} ${c.border} border`}
                      >
                        {tag}
                        <button
                          type="button"
                          className="cursor-pointer opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTag(tag);
                          }}
                        >
                          <XIcon size={10} weight="bold" />
                        </button>
                      </span>
                    );
                  })}
                  <input
                    ref={tagInputRef}
                    id="bulk-edit-tags"
                    className="bg-transparent outline-none flex-1 min-w-[120px] text-sm placeholder:text-faint py-0.5"
                    placeholder={
                      tags.length === 0 ? 'Type a tag and press Enter...' : 'Add another...'
                    }
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value);
                      setShowDropdown(true);
                      setHighlightedIdx(0);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onKeyDown={handleTagKeyDown}
                    disabled={clearFields.has('tags')}
                  />
                </div>
              </div>
              <label className="flex flex-col items-center gap-0.5 shrink-0 pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={clearFields.has('tags')}
                  onChange={() => toggleClear('tags')}
                />
                <span className="text-[9px] font-mono uppercase text-muted peer-checked:text-danger transition-colors">
                  Clear
                </span>
                <EraserIcon
                  size={12}
                  weight="duotone"
                  className="text-muted peer-checked:text-danger transition-colors"
                />
              </label>
            </div>

            {/* Tag suggestions dropdown */}
            {showDropdown && filtered.length > 0 && (
              <div className="relative">
                <div
                  ref={tagDropdownRef}
                  className="absolute top-1 left-0 right-0 bg-elevated border border-border rounded-lg shadow-lg z-30 max-h-40 overflow-y-auto"
                >
                  {filtered.map((t, i) => {
                    const c = getTagColorClasses(t.canonicalName, t.color);
                    return (
                      <button
                        key={t.nameLower}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                          i === highlightedIdx
                            ? 'bg-accent/10 text-accent'
                            : 'text-fg hover:bg-surface'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!tags.includes(t.nameLower)) {
                            setTags((prev) => [...prev, t.nameLower]);
                          }
                          setTagInput('');
                          setHighlightedIdx(0);
                          setShowDropdown(false);
                          tagInputRef.current?.focus();
                        }}
                      >
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}
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
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <label
                htmlFor="bulk-edit-volumeboost"
                className="block font-mono text-[10px] text-muted uppercase mb-1"
              >
                Volume Boost (dB)
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="bulk-edit-volumeboost"
                  className="input text-sm w-16 text-center disabled:opacity-30 disabled:cursor-not-allowed"
                  placeholder="0"
                  type="text"
                  value={volumeBoost}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^-?\d*$/.test(v)) setVolumeBoost(v);
                  }}
                  onBlur={() => {
                    if (volumeBoost.trim() === '' || volumeBoost.trim() === '-') {
                      setVolumeBoost('0');
                    } else {
                      const n = Number.parseInt(volumeBoost, 10);
                      if (!Number.isNaN(n)) {
                        setVolumeBoost(String(Math.min(200, Math.max(-100, n))));
                      }
                    }
                  }}
                  disabled={clearFields.has('volumeBoost')}
                />
                <span className="text-xs text-muted font-mono w-8 text-left">dB</span>
                <input
                  type="range"
                  min={-100}
                  max={200}
                  value={volumeNumeric}
                  onChange={(e) => setVolumeBoost(e.target.value)}
                  className={`volume-range-input${clearFields.has('volumeBoost') ? ' opacity-30 pointer-events-none' : ''}`}
                  disabled={clearFields.has('volumeBoost')}
                  style={{ ['--volume-pct' as string]: volumePct } as React.CSSProperties}
                />
              </div>
            </div>
            <label className="flex flex-col items-center gap-0.5 shrink-0 pt-5 cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={clearFields.has('volumeBoost')}
                onChange={() => toggleClear('volumeBoost')}
              />
              <span className="text-[9px] font-mono uppercase text-muted peer-checked:text-danger transition-colors">
                Clear
              </span>
              <EraserIcon
                size={12}
                weight="duotone"
                className="text-muted peer-checked:text-danger transition-colors"
              />
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="inherit" surface="surface" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button variant="primary" onClick={handleApply} disabled={isApplying} className="text-xs">
            {isApplying ? 'Applying...' : `Apply to ${count} songs`}
          </Button>
        </div>
      </div>
    </Backdrop>
  );
}
