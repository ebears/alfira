import { type SongRequest } from '@alfira/server/shared';
import { memo } from 'react';

import RequestCard from './RequestCard';
import { VirtualList } from './VirtualList';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VirtualRequestListProps {
  items: SongRequest[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  hasLoaded: boolean;
  isOwnFn: (requestedBy: string) => boolean;
  isAdmin: boolean;
  onRetry: () => void;
  onFetchMore: () => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onCancel: (id: string) => void;
  emptyTitle: string;
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div className='space-y-3'>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={`skel-${i}`}
          className='flex items-center gap-4 p-4 rounded-xl bg-elevated clay-resting'
        >
          <div className='skeleton w-14 h-14 rounded-lg shrink-0' />
          <div className='flex-1 min-w-0 space-y-2'>
            <div className='skeleton h-3 w-3/4' />
            <div className='skeleton h-2 w-1/2' />
          </div>
          <div className='skeleton h-4 w-16 rounded-full shrink-0' />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VirtualRequestList = memo(function VirtualRequestList({
  items,
  isLoading,
  isFetching,
  isError,
  hasMore,
  hasLoaded,
  isOwnFn,
  isAdmin,
  onRetry,
  onFetchMore,
  onApprove,
  onDeny,
  onCancel,
  emptyTitle,
  emptyMessage,
}: VirtualRequestListProps) {
  return (
    <VirtualList
      items={items}
      getItemKey={(req) => req.id}
      renderItem={(req) => (
        <RequestCard
          req={req}
          isOwn={isOwnFn(req.requestedBy)}
          isAdmin={isAdmin}
          onApprove={onApprove}
          onDeny={onDeny}
          onCancel={onCancel}
        />
      )}
      estimateSize={95}
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

export default VirtualRequestList;
