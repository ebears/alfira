import type { Playlist, Song } from '@alfira/server/shared';
import { memo, useCallback, useEffect, useState } from 'react';
import { useSongEdit } from '../context/SongEditContext';
import SongCard from './SongCard';
import { VirtualList } from './VirtualList';

/** Height allocated to an expanded row (card + edit panel + spacer). */
const EXPANDED_ROW_HEIGHT = 540;
/** Height of a collapsed song row (card + spacer). */
const COLLAPSED_ROW_HEIGHT = 105;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VirtualSongListProps {
  items: Song[];
  isAdminView: boolean;
  playlists: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  hasLoaded: boolean;
  playingId: string | null;
  onRetry: () => void;
  onFetchMore: () => void;
  onDelete?: (id: string) => void;
  onPlay: (id: string) => void;
  onAddToQueue: (id: string) => void;
  emptyTitle: string;
  emptyMessage?: string;
  // Bulk selection
  selectionMode?: boolean;
  isSelected?: (id: string) => boolean;
  onToggleSelect?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div className='flex flex-col gap-1.5'>
      {Array.from({ length: 8 }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key -- static skeleton placeholders
        <div
          key={`skeleton-${i}`}
          className='flex items-center gap-3 md:gap-4 px-4 py-4 rounded-lg bg-elevated clay-resting'
        >
          <div className='skeleton w-16 h-16 rounded border border-border shrink-0' />
          <div className='flex-1 min-w-0 flex flex-col gap-2'>
            <div className='skeleton h-3.5 w-2/5' />
            <div className='skeleton h-3 w-3/5' />
          </div>
          <div className='skeleton h-6 w-6 shrink-0' />
          <div className='skeleton h-4 w-4 shrink-0' />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VirtualSongList = memo(function VirtualSongList({
  items,
  isAdminView,
  playlists,
  isLoading,
  isFetching,
  isError,
  hasMore,
  hasLoaded,
  playingId,
  onRetry,
  onFetchMore,
  onDelete,
  onPlay,
  onAddToQueue,
  emptyTitle,
  emptyMessage,
  selectionMode = false,
  isSelected,
  onToggleSelect,
}: VirtualSongListProps) {
  const { openSongId } = useSongEdit();

  // Track the "effective" open song for layout purposes.
  // Expand: allocate space immediately so the row can grow into it.
  // Collapse: delay shrinking until the CSS max-height transition finishes (300ms),
  // otherwise the collapsing panel overflows behind the next row.
  const [effectiveOpenId, setEffectiveOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (openSongId) {
      // Expand immediately — allocate space before the transition starts.
      setEffectiveOpenId(openSongId);
    } else {
      // Collapse: wait for the CSS transition to finish before releasing space.
      const timeout = setTimeout(() => setEffectiveOpenId(null), 300);
      return () => clearTimeout(timeout);
    }
  }, [openSongId]);

  const estimateSize = useCallback(
    (index: number) => {
      const song = items[index];
      return song && song.id === effectiveOpenId ? EXPANDED_ROW_HEIGHT : COLLAPSED_ROW_HEIGHT;
    },
    [items, effectiveOpenId]
  );

  return (
    <VirtualList
      items={items}
      getItemKey={(song) => song.id}
      renderItem={(song) => (
        <SongCard
          song={song}
          variant='list'
          isAdminView={isAdminView}
          playlists={playlists}
          onDelete={onDelete}
          onPlay={() => onPlay(song.id)}
          isPlaying={playingId === song.id}
          onAddToQueue={() => onAddToQueue(song.id)}
          selectionMode={selectionMode}
          isSelected={isSelected?.(song.id) ?? false}
          onToggleSelect={onToggleSelect ? () => onToggleSelect(song.id) : undefined}
        />
      )}
      estimateSize={estimateSize}
      itemClassName='pb-3'
      isLoading={isLoading}
      hasLoaded={hasLoaded}
      isFetching={isFetching}
      isError={isError}
      hasMore={hasMore}
      onRetry={onRetry}
      onFetchMore={onFetchMore}
      skeleton={<SkeletonList />}
      emptyTitle={emptyTitle}
      emptyMessage={emptyMessage}
    />
  );
});

export default VirtualSongList;
