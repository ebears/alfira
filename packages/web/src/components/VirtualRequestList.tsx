import type { SongRequest } from '@alfira-bot/server/shared';
import { memo } from 'react';
import RequestCard from './RequestCard';
import { VirtualListFooter } from './ui/VirtualListFooter';

export interface VirtualRequestListProps {
  items: SongRequest[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isOwnFn: (requestedBy: string) => boolean;
  isAdmin: boolean;
  onRetry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onCancel: (id: string) => void;
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are static placeholders
          key={`skeleton-${i}`}
          className="flex items-center gap-4 p-4 rounded-xl bg-elevated clay-resting"
        >
          <div className="skeleton w-14 h-14 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-2 w-1/2" />
          </div>
          <div className="skeleton h-4 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

export const VirtualRequestList = memo(function VirtualRequestList({
  items,
  isLoading,
  isFetching,
  isError,
  isOwnFn,
  isAdmin,
  onRetry,
  sentinelRef,
  onApprove,
  onDeny,
  onCancel,
}: VirtualRequestListProps) {
  if (isLoading) {
    return <SkeletonList />;
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <div className="flex flex-col gap-3">
        {items.map((req) => (
          <RequestCard
            key={req.id}
            req={req}
            isOwn={isOwnFn(req.requestedBy)}
            isAdmin={isAdmin}
            onApprove={onApprove}
            onDeny={onDeny}
            onCancel={onCancel}
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

export default VirtualRequestList;
