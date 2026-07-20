import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
      <SpringUp className='w-full max-w-sm glass-modal flex flex-col max-h-[70vh]'>
        <div className='p-4 border-b border-border flex items-center justify-between'>
          <h3 className='font-body font-semibold text-sm text-fg'>Filters</h3>
          <button
            type='button'
            className='p-1 rounded hover:bg-elevated transition-colors cursor-pointer'
            onClick={onClose}
            aria-label='Close'
          >
            <XIcon size={16} weight='bold' className='text-muted' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto'>
          {/* ── Tags section ─────────────────────────────────── */}
          <div className='p-4 border-b border-border'>
            <p className='font-mono text-[11px] text-muted uppercase tracking-wider mb-2.5'>Tags</p>

            <div className='relative mb-2.5'>
              <MagnifyingGlassIcon
                className='absolute left-2.5 top-1/2 -translate-y-1/2 text-faint w-3.5 h-3.5'
                weight='duotone'
              />
              <input
                ref={inputRef}
                className='input pl-8 py-1.5 text-xs'
                placeholder='Search tags...'
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
              />
            </div>

            {filteredTags.length === 0 ? (
              <p className='font-mono text-xs text-muted py-2 text-center'>
                {tagSearch ? 'no matching tags' : 'no tags available'}
              </p>
            ) : (
              <div className='flex flex-wrap gap-1.5 max-h-40 overflow-y-auto'>
                {filteredTags.map((tag) => {
                  const isActive = activeTags.includes(tag.nameLower);
                  const explicitColor = tag.color ?? null;
                  const colors = getTagColorClasses(tag.canonicalName, explicitColor);
                  return (
                    <button
                      key={tag.nameLower}
                      type='button'
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-opacity hover:opacity-80 active:opacity-70 ${
                        isActive
                          ? `${colors.bg} ${colors.text} ring-1 ring-inset ring-current/30`
                          : `${colors.bg} ${colors.text} opacity-60 hover:opacity-90`
                      }`}
                      onClick={() => handleTagClick(tag)}
                    >
                      {isActive && <XIcon size={10} weight='bold' />}
                      {tag.canonicalName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sources section ──────────────────────────────── */}
          <div className='p-4'>
            <p className='font-mono text-[11px] text-muted uppercase tracking-wider mb-2.5'>
              Source
            </p>

            <div className='space-y-1'>
              {SOURCES.map((source) => {
                const isActive = activeSources.includes(source.key);
                return (
                  <label
                    key={source.key}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors select-none ${
                      isActive
                        ? 'bg-accent/5 text-accent'
                        : 'hover:bg-elevated active:bg-elevated/80 text-muted'
                    }`}
                  >
                    <input
                      type='checkbox'
                      checked={isActive}
                      onChange={() => handleSourceToggle(source.key)}
                      className='sr-only'
                    />
                    <span className='flex items-center gap-2 flex-1'>
                      <SourceIcon sourceKey={source.key} />
                      <span className='font-body text-sm'>{source.label}</span>
                    </span>
                    {isActive && <span className='text-[11px] font-mono text-accent'>active</span>}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </SpringUp>
    </Backdrop>
  );
}
