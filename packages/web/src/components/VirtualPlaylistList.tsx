import type { Playlist } from '@alfira-bot/server/shared';
import { memo } from 'react';
import PlaylistRow from './PlaylistRow';
import { VirtualListFooter } from './ui/VirtualListFooter';

interface VirtualPlaylistListProps {
  items: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
  onRowClick: (e: React.MouseEvent) => void;
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
  onRetry,
  sentinelRef,
  onRowClick,
}: VirtualPlaylistListProps) {
  if (isLoading) {
    return <SkeletonList />;
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative">
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
    </div>
  );
});

export default VirtualPlaylistList;
