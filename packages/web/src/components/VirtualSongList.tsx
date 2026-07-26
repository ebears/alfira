import { type Playlist, type Song } from '@alfira/server/shared';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { useSongEdit } from '../context/SongEditContext';
import SongCard from './SongCard';
import { Skeleton } from './ui/Skeleton';
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
        <div
          key={`skeleton-${i}`}
          className='bg-elevated clay-resting flex items-center gap-3 rounded-lg px-4 py-4 md:gap-4'
        >
          <Skeleton className='border-border h-16 w-16 shrink-0 rounded border' />
          <div className='flex min-w-0 flex-1 flex-col gap-2'>
            <Skeleton className='h-3.5 w-2/5' />
            <Skeleton className='h-3 w-3/5' />
          </div>
          <Skeleton className='h-6 w-6 shrink-0' />
          <Skeleton className='h-4 w-4 shrink-0' />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item wrapper — creates stable event callbacks per song
// ---------------------------------------------------------------------------

interface SongListItemProps {
  song: Song;
  isAdminView: boolean;
  playlists: Playlist[];
  playingId: string | null;
  selectionMode: boolean;
  isSelected: boolean;
  onDelete?: (id: string) => void;
  onPlay: (id: string) => void;
  onAddToQueue: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}

const SongListItem = memo(function SongListItem({
  song,
  isAdminView,
  playlists,
  playingId,
  selectionMode,
  isSelected,
  onDelete,
  onPlay,
  onAddToQueue,
  onToggleSelect,
}: SongListItemProps) {
  const handlePlay = useCallback(() => {
    onPlay(song.id);
  }, [onPlay, song.id]);
  const handleAddToQueue = useCallback(() => {
    onAddToQueue(song.id);
  }, [onAddToQueue, song.id]);
  const handleToggleSelect = useCallback(
    () => onToggleSelect?.(song.id),
    [onToggleSelect, song.id]
  );

  return (
    <SongCard
      song={song}
      variant='list'
      isAdminView={isAdminView}
      playlists={playlists}
      onDelete={onDelete}
      onPlay={handlePlay}
      isPlaying={playingId === song.id}
      onAddToQueue={handleAddToQueue}
      selectionMode={selectionMode}
      isSelected={isSelected}
      onToggleSelect={onToggleSelect ? handleToggleSelect : undefined}
    />
  );
});

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
      return;
    } else {
      // Collapse: wait for the exit animation to finish before releasing space.
      const timeout = setTimeout(() => {
        setEffectiveOpenId(null);
      }, 200);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [openSongId]);

  const estimateSize = useCallback(
    (index: number) => {
      const song = items[index];
      return song?.id === effectiveOpenId ? EXPANDED_ROW_HEIGHT : COLLAPSED_ROW_HEIGHT;
    },
    [items, effectiveOpenId]
  );

  const getItemKey = useCallback((song: Song) => song.id, []);

  const renderItem = useCallback(
    (song: Song) => (
      <SongListItem
        song={song}
        isAdminView={isAdminView}
        playlists={playlists}
        playingId={playingId}
        selectionMode={selectionMode}
        isSelected={isSelected?.(song.id) ?? false}
        onDelete={onDelete}
        onPlay={onPlay}
        onAddToQueue={onAddToQueue}
        onToggleSelect={onToggleSelect}
      />
    ),
    [
      isAdminView,
      playlists,
      playingId,
      selectionMode,
      isSelected,
      onDelete,
      onPlay,
      onAddToQueue,
      onToggleSelect,
    ]
  );

  const skeleton = useMemo(() => <SkeletonList />, []);

  return (
    <VirtualList
      items={items}
      getItemKey={getItemKey}
      renderItem={renderItem}
      estimateSize={estimateSize}
      itemClassName='pb-3'
      isLoading={isLoading}
      hasLoaded={hasLoaded}
      isFetching={isFetching}
      isError={isError}
      hasMore={hasMore}
      onRetry={onRetry}
      onFetchMore={onFetchMore}
      skeleton={skeleton}
      emptyTitle={emptyTitle}
      emptyMessage={emptyMessage}
    />
  );
});

export default VirtualSongList;
