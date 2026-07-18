import type { Playlist, Song } from '@alfira/server/shared';
import { memo } from 'react';
import * as m from 'motion/react-m';
import SongCard from './SongCard';
import { springUpStaggered } from '../lib/motion';
import VirtualListShell from './VirtualListShell';

interface VirtualSongListProps {
  items: Song[];
  viewMode: 'grid' | 'list';
  isAdminView: boolean;
  playlists: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  hasLoaded: boolean;
  playingId: string | null;
  onRetry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
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

function SkeletonGrid() {
  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 md:gap-4'>
      {Array.from({ length: 12 }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key -- static skeleton placeholders
        <div key={`skel-${i}`} className='flex flex-col bg-elevated clay-resting rounded-lg'>
          <div className='relative aspect-square overflow-hidden rounded-lg border border-border m-3 mb-0'>
            <div className='skeleton w-full h-full' />
          </div>
          <div className='p-4 flex-1 flex flex-col gap-2'>
            <div className='flex justify-between'>
              <div className='skeleton h-3.5 w-3/4' />
              <div className='skeleton h-3.5 w-3.5 rounded-full' />
            </div>
            <div className='flex justify-between'>
              <div className='skeleton h-3 w-2/5' />
              <div className='skeleton h-3 w-10' />
            </div>
            <div className='flex justify-between'>
              <div className='skeleton h-3 w-1/2' />
              <div className='skeleton h-3 w-8' />
            </div>
            <div className='flex justify-between pt-1'>
              <div className='skeleton h-3 w-16' />
              <span className='flex gap-1'>
                <div className='skeleton h-8 w-8 rounded-full' />
                <div className='skeleton h-8 w-8 rounded-full' />
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className='flex flex-col gap-1.5'>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          // eslint-disable-next-line react/no-array-index-key -- skeleton items are static placeholders
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

export const VirtualSongList = memo(function VirtualSongList({
  items,
  viewMode,
  isAdminView,
  playlists,
  isLoading,
  isFetching,
  isError,
  hasMore,
  hasLoaded,
  playingId,
  onRetry,
  sentinelRef,
  onDelete,
  onPlay,
  onAddToQueue,
  emptyTitle,
  emptyMessage,
  selectionMode = false,
  isSelected,
  onToggleSelect,
}: VirtualSongListProps) {
  const isGrid = viewMode === 'grid';

  const gridClass = isGrid
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 md:gap-4 items-start'
    : 'flex flex-col gap-1.5';

  return (
    <VirtualListShell
      isLoading={isLoading}
      hasLoaded={hasLoaded}
      isEmpty={items.length === 0}
      isFetching={isFetching}
      isError={isError}
      hasMore={hasMore}
      onRetry={onRetry}
      sentinelRef={sentinelRef}
      skeleton={isGrid ? <SkeletonGrid /> : <SkeletonList />}
      emptyTitle={emptyTitle}
      emptyMessage={emptyMessage}
      endSpacer
    >
      <div className={gridClass}>
        {items.map((song, index) => (
          <m.div
            key={song.id}
            initial='hidden'
            animate='show'
            variants={springUpStaggered}
            custom={index % 24}
          >
            <SongCard
              key={song.id}
              song={song}
              variant={viewMode === 'grid' ? 'grid' : 'list'}
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
          </m.div>
        ))}
      </div>
    </VirtualListShell>
  );
});

export default VirtualSongList;
