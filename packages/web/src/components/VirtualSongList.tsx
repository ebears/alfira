import type { Playlist, Song } from '@alfira-bot/server/shared';
import { memo, useLayoutEffect, useRef } from 'react';
import EmptyState from './EmptyState';
import SongCard from './SongCard';
import { VirtualListFooter } from './ui/VirtualListFooter';

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 md:gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are static placeholders
        <div key={`skeleton-${i}`} className="flex flex-col bg-elevated clay-resting rounded-lg">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-border m-3 mb-0">
            <div className="skeleton w-full h-full" />
          </div>
          <div className="p-4 flex-1 flex flex-col gap-2">
            <div className="flex justify-between">
              <div className="skeleton h-3.5 w-3/4" />
              <div className="skeleton h-3.5 w-3.5 rounded-full" />
            </div>
            <div className="flex justify-between">
              <div className="skeleton h-3 w-2/5" />
              <div className="skeleton h-3 w-10" />
            </div>
            <div className="flex justify-between">
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-3 w-8" />
            </div>
            <div className="flex justify-between pt-1">
              <div className="skeleton h-3 w-16" />
              <span className="flex gap-1">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="skeleton h-8 w-8 rounded-full" />
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
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are static placeholders
          key={`skeleton-${i}`}
          className="flex items-center gap-3 md:gap-4 px-4 py-4 rounded-lg bg-elevated clay-resting"
        >
          <div className="skeleton w-16 h-16 rounded border border-border shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="skeleton h-3.5 w-2/5" />
            <div className="skeleton h-3 w-3/5" />
          </div>
          <div className="skeleton h-6 w-6 shrink-0" />
          <div className="skeleton h-4 w-4 shrink-0" />
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
  const containerRef = useRef<HTMLDivElement>(null);
  const isGrid = viewMode === 'grid';
  const showSkeleton = isLoading;
  const showEmpty = hasLoaded && items.length === 0;
  const showContent = !isLoading && hasLoaded && items.length > 0;

  // Reveal the container only after React has committed all DOM mutations,
  // so the browser paints all cards at once without any staggered rendering.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.opacity = showContent || showEmpty || showSkeleton ? '1' : '0';
  }, [showContent, showEmpty, showSkeleton]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ opacity: 0, transition: 'opacity 120ms ease' }}
    >
      {showSkeleton && (isGrid ? <SkeletonGrid /> : <SkeletonList />)}
      {showEmpty && <EmptyState title={emptyTitle} message={emptyMessage} />}
      {showContent && (
        <>
          <div
            className={
              isGrid
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 md:gap-4 items-start'
                : 'flex flex-col gap-1.5'
            }
          >
            {items.map((song) => (
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
            ))}
          </div>
          <VirtualListFooter
            sentinelRef={sentinelRef}
            isFetching={isFetching}
            isError={isError}
            onRetry={onRetry}
          />
          {!isFetching && !isError && !hasMore && items.length > 0 && <div className="h-4" />}
        </>
      )}
    </div>
  );
});

export default VirtualSongList;
