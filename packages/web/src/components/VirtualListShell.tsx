import { memo, useLayoutEffect, useRef } from 'react';
import EmptyState from './EmptyState';
import { VirtualListFooter } from './ui/VirtualListFooter';

interface VirtualListShellProps {
  isLoading: boolean;
  hasLoaded: boolean;
  isEmpty: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore?: boolean;
  onRetry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
  skeleton: React.ReactNode;
  emptyTitle: string;
  emptyMessage?: string;
  endSpacer?: boolean;
  children: React.ReactNode;
}

export const VirtualListShell = memo(function VirtualListShell({
  isLoading,
  hasLoaded,
  isEmpty,
  isFetching,
  isError,
  hasMore = false,
  onRetry,
  sentinelRef,
  skeleton,
  emptyTitle,
  emptyMessage,
  endSpacer = false,
  children,
}: VirtualListShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const showSkeleton = isLoading;
  const showEmpty = hasLoaded && isEmpty;
  const showContent = !isLoading && hasLoaded && !isEmpty;

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
      {showSkeleton && skeleton}
      {showEmpty && <EmptyState title={emptyTitle} message={emptyMessage} />}
      {showContent && (
        <>
          {children}
          <VirtualListFooter
            sentinelRef={sentinelRef}
            isFetching={isFetching}
            isError={isError}
            onRetry={onRetry}
          />
          {endSpacer && !isFetching && !isError && !hasMore && <div className="h-4" />}
        </>
      )}
    </div>
  );
});

export default VirtualListShell;
