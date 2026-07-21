import type React from 'react';

import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { type TagItem, useTagColors } from '../context/TagsContext';
import { getTagColorClasses } from '../utils/tagColors';
import { Backdrop } from './Backdrop';
import { SourceIcon } from './SourceIcons';
import { SpringUp } from './ui/SpringUp';

// ---------------------------------------------------------------------------
// Available sources — must mirror the server's SOURCE_LIKE_PATTERNS and the
// web's HOST_TO_SOURCE map.
// ---------------------------------------------------------------------------
const SOURCES: { key: string; label: string }[] = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'soundcloud', label: 'SoundCloud' },
  { key: 'spotify', label: 'Spotify' },
  { key: 'applemusic', label: 'Apple Music' },
  { key: 'tidal', label: 'Tidal' },
  { key: 'googledrive', label: 'Google Drive' },
];

// ---------------------------------------------------------------------------
// Child components — extracted so useCallback closures are stable per item
// ---------------------------------------------------------------------------

interface FilterTagButtonProps {
  tag: TagItem;
  isActive: boolean;
  onClick: (tag: TagItem) => void;
}

const FilterTagButton = memo(function FilterTagButton({
  tag,
  isActive,
  onClick,
}: FilterTagButtonProps) {
  const explicitColor = tag.color ?? null;
  const colors = getTagColorClasses(tag.canonicalName, explicitColor);
  const handleClick = useCallback(() => {
    onClick(tag);
  }, [onClick, tag]);

  return (
    <button
      type='button'
      className={`inline-flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-opacity hover:opacity-80 active:opacity-70 ${
        isActive
          ? `${colors.bg} ${colors.text} ring-1 ring-current/30 ring-inset`
          : `${colors.bg} ${colors.text} opacity-60 hover:opacity-90`
      }`}
      onClick={handleClick}
    >
      {isActive && <XIcon size={10} weight='bold' />}
      {tag.canonicalName}
    </button>
  );
});

interface FilterSourceRowProps {
  source: { key: string; label: string };
  isActive: boolean;
  onToggle: (sourceKey: string) => void;
}

const FilterSourceRow = memo(function FilterSourceRow({
  source,
  isActive,
  onToggle,
}: FilterSourceRowProps) {
  const handleChange = useCallback(() => {
    onToggle(source.key);
  }, [onToggle, source.key]);

  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors select-none ${
        isActive ? 'bg-accent/5 text-accent' : 'hover:bg-elevated active:bg-elevated/80 text-muted'
      }`}
    >
      <input type='checkbox' checked={isActive} onChange={handleChange} className='sr-only' />
      <span className='flex flex-1 items-center gap-2'>
        <SourceIcon sourceKey={source.key} />
        <span className='font-body text-sm'>{source.label}</span>
      </span>
      {isActive && <span className='text-accent font-mono text-[11px]'>active</span>}
    </label>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AddFilterPopoverProps {
  activeTags: string[];
  activeSources: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onAddSource: (source: string) => void;
  onRemoveSource: (source: string) => void;
  onClose: () => void;
}

export default function AddFilterPopover({
  activeTags,
  activeSources,
  onAddTag,
  onRemoveTag,
  onAddSource,
  onRemoveSource,
  onClose,
}: AddFilterPopoverProps) {
  const { tags: allTags } = useTagColors();
  const [tagSearch, setTagSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sort: active tags first, then alphabetically. Search filters the whole list.
  const sortedTags = [...allTags].sort((a, b) => {
    const aActive = activeTags.includes(a.nameLower);
    const bActive = activeTags.includes(b.nameLower);
    if (aActive && !bActive) {
      return -1;
    }
    if (!aActive && bActive) {
      return 1;
    }
    return a.canonicalName.localeCompare(b.canonicalName);
  });

  const filteredTags = tagSearch
    ? sortedTags.filter((t) => t.canonicalName.toLowerCase().includes(tagSearch.toLowerCase()))
    : sortedTags;

  const handleTagClick = useCallback(
    (tag: TagItem) => {
      if (activeTags.includes(tag.nameLower)) {
        onRemoveTag(tag.nameLower);
      } else {
        onAddTag(tag.nameLower);
      }
    },
    [activeTags, onAddTag, onRemoveTag]
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTagSearch(e.target.value);
  }, []);

  const handleSourceToggle = useCallback(
    (sourceKey: string) => {
      if (activeSources.includes(sourceKey)) {
        onRemoveSource(sourceKey);
      } else {
        onAddSource(sourceKey);
      }
    },
    [activeSources, onAddSource, onRemoveSource]
  );

  return (
    <Backdrop onClose={onClose}>
      <SpringUp className='glass-modal flex max-h-[70vh] w-full max-w-sm flex-col'>
        <div className='border-border flex items-center justify-between border-b p-4'>
          <h3 className='font-body text-fg text-sm font-semibold'>Filters</h3>
          <button
            type='button'
            className='hover:bg-elevated cursor-pointer rounded p-1 transition-colors'
            onClick={onClose}
            aria-label='Close'
          >
            <XIcon size={16} weight='bold' className='text-muted' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto'>
          {/* ── Tags section ─────────────────────────────────── */}
          <div className='border-border border-b p-4'>
            <p className='text-muted mb-2.5 font-mono text-[11px] tracking-wider uppercase'>Tags</p>

            <div className='relative mb-2.5'>
              <MagnifyingGlassIcon
                className='text-faint absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2'
                weight='duotone'
              />
              <input
                ref={inputRef}
                className='input py-1.5 pl-8 text-xs'
                placeholder='Search tags...'
                value={tagSearch}
                onChange={handleSearchChange}
              />
            </div>

            {filteredTags.length === 0 ? (
              <p className='text-muted py-2 text-center font-mono text-xs'>
                {tagSearch ? 'no matching tags' : 'no tags available'}
              </p>
            ) : (
              <div className='flex max-h-40 flex-wrap gap-1.5 overflow-y-auto'>
                {filteredTags.map((tag) => {
                  const isActive = activeTags.includes(tag.nameLower);
                  return (
                    <FilterTagButton
                      key={tag.nameLower}
                      tag={tag}
                      isActive={isActive}
                      onClick={handleTagClick}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sources section ──────────────────────────────── */}
          <div className='p-4'>
            <p className='text-muted mb-2.5 font-mono text-[11px] tracking-wider uppercase'>
              Source
            </p>

            <div className='space-y-1'>
              {SOURCES.map((source) => (
                <FilterSourceRow
                  key={source.key}
                  source={source}
                  isActive={activeSources.includes(source.key)}
                  onToggle={handleSourceToggle}
                />
              ))}
            </div>
          </div>
        </div>
      </SpringUp>
    </Backdrop>
  );
}
