import { TagIcon, XIcon } from '@phosphor-icons/react';
import { memo, useCallback } from 'react';

import { getTagColorClasses } from '../utils/tagColors';
import { SourceIcon } from './SourceIcons';

// ---------------------------------------------------------------------------
// Source label map — must mirror AddFilterPopover.SOURCES
// ---------------------------------------------------------------------------
const SOURCE_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  applemusic: 'Apple Music',
  tidal: 'Tidal',
  googledrive: 'Google Drive',
};

// ---------------------------------------------------------------------------
// Child components — extracted so useCallback closures are stable per item
// ---------------------------------------------------------------------------

interface FilterTagChipProps {
  tag: string;
  onRemove: (tag: string) => void;
}

const FilterTagChip = memo(function FilterTagChip({ tag, onRemove }: FilterTagChipProps) {
  const colors = getTagColorClasses(tag, null);
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(tag);
    },
    [onRemove, tag]
  );

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap select-none ${colors.bg} ${colors.text}`}
    >
      <TagIcon size={11} weight='fill' />
      <span>{tag}</span>
      <button
        type='button'
        className='ml-0.5 cursor-pointer rounded-full p-px hover:bg-black/10 dark:hover:bg-white/10 transition-colors'
        onClick={handleRemove}
        aria-label={`Remove tag filter: ${tag}`}
      >
        <XIcon size={10} weight='bold' />
      </button>
    </span>
  );
});

interface FilterSourceChipProps {
  source: string;
  onRemove: (source: string) => void;
}

const FilterSourceChip = memo(function FilterSourceChip({
  source,
  onRemove,
}: FilterSourceChipProps) {
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(source);
    },
    [onRemove, source]
  );

  return (
    <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap select-none bg-elevated text-muted border border-border/50'>
      <SourceIcon sourceKey={source} />
      <span>{SOURCE_LABELS[source] ?? source}</span>
      <button
        type='button'
        className='ml-0.5 cursor-pointer rounded-full p-px hover:bg-black/10 dark:hover:bg-white/10 transition-colors'
        onClick={handleRemove}
        aria-label={`Remove source filter: ${SOURCE_LABELS[source] ?? source}`}
      >
        <XIcon size={10} weight='bold' />
      </button>
    </span>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface FilterChipsProps {
  tags: string[];
  sources: string[];
  onRemoveTag: (tag: string) => void;
  onRemoveSource: (source: string) => void;
}

export default function FilterChips({
  tags,
  sources,
  onRemoveTag,
  onRemoveSource,
}: FilterChipsProps) {
  return (
    <div className='flex items-center gap-2 flex-wrap'>
      {tags.map((tag) => (
        <FilterTagChip key={`tag-${tag}`} tag={tag} onRemove={onRemoveTag} />
      ))}
      {sources.map((source) => (
        <FilterSourceChip key={`source-${source}`} source={source} onRemove={onRemoveSource} />
      ))}
    </div>
  );
}
