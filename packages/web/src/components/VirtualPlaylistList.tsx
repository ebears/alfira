import type { Playlist } from '@alfira-bot/server/shared';
import { memo, useLayoutEffect, useRef } from 'react';
import EmptyState from './EmptyState';
import PlaylistRow from './PlaylistRow';
import { VirtualListFooter } from './ui/VirtualListFooter';

interface VirtualPlaylistListProps {
  items: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasLoaded: boolean;
  onRetry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
  onRowClick: (e: React.MouseEvent) => void;
  emptyTitle: string;
  emptyMessage?: string;
}

function SkeletonList() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are static placeholders
        <div key={`skeleton-${i}`} className="card flex items-center gap-4 px-5 py-4">
          <div className="skeleton w-10 h-10 rounded" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-48" />
            <div className="skeleton h-2.5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export const VirtualPlaylistList = memo(function VirtualPlaylistList({
  items,
  isLoading,
  isFetching,
  isError,
  hasLoaded,
  onRetry,
  sentinelRef,
  onRowClick,
  emptyTitle,
  emptyMessage,
}: VirtualPlaylistListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const showSkeleton = isLoading;
  const showEmpty = hasLoaded && items.length === 0;
  const showContent = !isLoading && hasLoaded && items.length > 0;

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
      {showSkeleton && <SkeletonList />}
      {showEmpty && <EmptyState title={emptyTitle} message={emptyMessage} />}
      {showContent && (
        <>
          <div className="flex flex-col gap-3">
            {items.map((playlist) => (
              <PlaylistRow
                key={playlist.id}
                playlist={playlist}
                animationDelay="0ms"
                onClick={onRowClick}
                data-playlist-id={playlist.id}
              />
            ))}
          </div>
          <VirtualListFooter
            sentinelRef={sentinelRef}
            isFetching={isFetching}
            isError={isError}
            onRetry={onRetry}
          />
        </>
      )}
    </div>
  );
});

export default VirtualPlaylistList;
