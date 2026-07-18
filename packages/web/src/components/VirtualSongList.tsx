import type { Playlist, Song } from '@alfira/server/shared';
import { memo } from 'react';
import SongCard from './SongCard';
import { VirtualList } from './VirtualList';

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
      estimateSize={105}
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
