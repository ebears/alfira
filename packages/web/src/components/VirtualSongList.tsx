import type { Playlist, Song } from '@alfira-bot/server/shared';
import { memo } from 'react';
import SongCard from './SongCard';
import SongRow from './SongRow';

interface VirtualSongListProps {
  items: Song[];
  viewMode: 'grid' | 'list';
  isAdminView: boolean;
  playlists: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  playingId: string | null;
  onRetry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
  onAddToQueue: (id: string) => void;
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 md:gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are static placeholders
        <div key={`skeleton-${i}`} className="flex flex-col bg-elevated rounded-xl clay-resting">
          <div className="relative aspect-square bg-elevated overflow-hidden rounded-xl clay-flat m-3 mb-0">
            <div className="skeleton w-full h-full" />
            <div className="absolute bottom-2 right-2 z-20">
              <div className="skeleton h-3 w-8" />
            </div>
          </div>
          <div className="p-4 flex-1">
            <div className="skeleton h-3 w-3/4 mb-2" />
            <div className="skeleton h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are static placeholders
          key={`skeleton-${i}`}
          className="flex items-center gap-2 md:gap-4 px-3 md:px-4 py-3 rounded-lg bg-elevated clay-resting"
        >
          <div className="skeleton w-14 h-14 md:w-12 md:h-12 rounded border border-border shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-2 w-1/2 mt-1" />
          </div>
          <div className="skeleton h-3 w-10 shrink-0 hidden md:block" />
          <div className="skeleton h-6 w-6 shrink-0" />
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
  playingId,
  onRetry,
  sentinelRef,
  onDelete,
  onPlay,
  onAddToQueue,
}: VirtualSongListProps) {
  if (isLoading) {
    return viewMode === 'grid' ? <SkeletonGrid /> : <SkeletonList />;
  }

  if (items.length === 0) {
    return null;
  }

  if (viewMode === 'grid') {
    return (
      <div className="relative">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 md:gap-4 items-start">
          {items.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              isAdminView={isAdminView}
              playlists={playlists}
              onDelete={onDelete}
              onPlay={onPlay}
              isPlaying={playingId === song.id}
              onAddToQueue={onAddToQueue}
            />
          ))}
        </div>
        {/* Sentinel at bottom to trigger load more */}
        <div ref={sentinelRef}>
          {isError && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={onRetry}
                className="font-mono text-xs text-muted hover:text-fg transition-colors underline"
              >
                Failed to load more. Retry
              </button>
            </div>
          )}
          {isFetching && !isError && (
            <div className="flex justify-center py-4 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static loading indicator, order never changes
                  key={`loading-dot-${i}`}
                  className="skeleton h-3 w-3 rounded-full animate-pulse"
                />
              ))}
            </div>
          )}
          {!isFetching && !isError && !hasMore && items.length > 0 && <div className="h-4" />}
        </div>
      </div>
    );
  }

  // List view — flex column with page scroll. Sentinel at bottom.
  return (
    <div className="relative">
      <div className="flex flex-col gap-1">
        {items.map((song) => (
          <SongRow
            key={song.id}
            song={song}
            isAdminView={isAdminView}
            playlists={playlists}
            onDelete={onDelete}
            onPlay={() => onPlay(song.id)}
            isPlaying={playingId === song.id}
            onAddToQueue={() => onAddToQueue(song.id)}
          />
        ))}
      </div>
      {/* Sentinel at bottom to trigger load more */}
      <div ref={sentinelRef}>
        {isError && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={onRetry}
              className="font-mono text-xs text-muted hover:text-fg transition-colors underline"
            >
              Failed to load more. Retry
            </button>
          </div>
        )}
        {isFetching && !isError && (
          <div className="flex justify-center py-4 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static loading indicator, order never changes
                key={`loading-dot-${i}`}
                className="skeleton h-3 w-3 rounded-full animate-pulse"
              />
            ))}
          </div>
        )}
        {!isFetching && !isError && !hasMore && items.length > 0 && <div className="h-4" />}
      </div>
    </div>
  );
});

export default VirtualSongList;
