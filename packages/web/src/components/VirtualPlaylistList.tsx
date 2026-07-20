import { type Playlist } from '@alfira/server/shared';
import { memo } from 'react';
import PlaylistRow from './PlaylistRow';
import { VirtualList } from './VirtualList';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VirtualPlaylistListProps {
  items: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  hasLoaded: boolean;
  onRetry: () => void;
  onFetchMore: () => void;
  onRowClick: (e: React.MouseEvent) => void;
  emptyTitle: string;
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div className='grid gap-3'>
      {Array.from({ length: 4 }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key -- static skeleton placeholders
        <div key={`skeleton-${i}`} className='card flex items-center gap-4 px-5 py-4'>
          <div className='skeleton w-10 h-10 rounded' />
          <div className='flex-1 space-y-2'>
            <div className='skeleton h-3 w-48' />
            <div className='skeleton h-2.5 w-24' />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VirtualPlaylistList = memo(function VirtualPlaylistList({
  items,
  isLoading,
  isFetching,
  isError,
  hasMore,
  hasLoaded,
  onRetry,
  onFetchMore,
  onRowClick,
  emptyTitle,
  emptyMessage,
}: VirtualPlaylistListProps) {
  return (
    <VirtualList
      items={items}
      getItemKey={(playlist) => playlist.id}
      renderItem={(playlist) => (
        <PlaylistRow
          playlist={playlist}
          animationDelay='0ms'
          onClick={onRowClick}
          data-playlist-id={playlist.id}
        />
      )}
      estimateSize={120}
      itemClassName='pb-4'
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

export default VirtualPlaylistList;
