import { memo } from 'react';

interface VirtualListFooterProps {
  sentinelRef: (el: HTMLDivElement | null) => void;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
}

export const VirtualListFooter = memo(function VirtualListFooter({
  sentinelRef,
  isFetching,
  isError,
  onRetry,
}: VirtualListFooterProps) {
  return (
    <div ref={sentinelRef}>
      {isError && (
        <div className='flex justify-center py-4'>
          <button
            type='button'
            onClick={onRetry}
            className='font-mono text-xs text-muted hover:text-fg transition-colors underline'
          >
            Failed to load more. Retry
          </button>
        </div>
      )}
      {isFetching && !isError && (
        <div className='flex justify-center py-4 gap-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static loading indicator, order never changes
              key={`loading-dot-${i}`}
              className='skeleton h-3 w-3 rounded-full animate-pulse'
            />
          ))}
        </div>
      )}
    </div>
  );
});
