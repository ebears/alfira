import { useVirtualizer } from '@tanstack/react-virtual';
import { type Transition } from 'motion/react';
import * as m from 'motion/react-m';
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { listItemVariants } from '../lib/motion';
import EmptyState from './EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VirtualListProps<T> {
  items: T[];
  /** Unique key for each item. */
  getItemKey: (item: T, index: number) => string;
  /** Render a single item. Receives the item and its index in the array. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /**
   * Estimated height (px) of a row. Can be a flat number or a function
   * receiving the item index. Use a function when rows have different
   * heights (e.g. an expanded edit panel).
   */
  estimateSize: number | ((index: number) => number);
  /** Number of items to render outside the visible area. Default 5. */
  overscan?: number;
  /** CSS class applied to the measuring wrapper around each item. Use for gap/spacing. */
  itemClassName?: string;
  /** Called when the user scrolls near the end of loaded items. */
  onFetchMore?: () => void;

  // -- Loading / error / empty states --
  isLoading: boolean;
  hasLoaded: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  onRetry: () => void;
  /** Skeleton element shown during initial load. */
  skeleton: React.ReactNode;
  emptyTitle: string;
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function VirtualListInner<T>({
  items,
  getItemKey,
  renderItem,
  estimateSize,
  overscan = 5,
  itemClassName,
  onFetchMore,
  isLoading,
  hasLoaded,
  isFetching,
  isError,
  hasMore,
  onRetry,
  skeleton,
  emptyTitle,
  emptyMessage,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the user-provided getItemKey in a ref so the virtualizer's
  // getItemKey stays referentially stable across re-renders. Otherwise the
  // virtualizer re-indexes on every render and discards measurements.
  const getItemKeyRef = useRef(getItemKey);
  getItemKeyRef.current = getItemKey;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Keep estimateSize in a ref so the virtualizer's estimateSize stays
  // referentially stable while still reading the latest value.
  const estimateSizeRef = useRef(estimateSize);
  estimateSizeRef.current = estimateSize;

  // The virtualizer count includes a loader row when there are more pages.
  const totalCount = hasMore ? items.length + 1 : items.length;

  const virtualizer = useVirtualizer({
    count: totalCount,
    getItemKey: (i: number) => {
      if (i >= itemsRef.current.length) return '__loader__';
      const item = itemsRef.current[i];
      return item != null ? getItemKeyRef.current(item, i) : `__missing__${i}`;
    },
    getScrollElement: () => scrollRef.current,
    estimateSize: (index: number) => {
      const fn = estimateSizeRef.current;
      return typeof fn === 'function' ? fn(index) : fn;
    },
    overscan,
  });

  // Trigger fetch when the last data item enters the overscan window.
  // Matches the official TanStack infinite-scroll pattern.
  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    if (
      lastVirtualItem &&
      lastVirtualItem.index >= items.length - 1 &&
      hasMore &&
      !isFetching &&
      !isError
    ) {
      onFetchMore?.();
    }
    // onFetchMore is intentionally excluded — it's typically a stable ref or callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isFetching, isError, items.length, virtualizer.getVirtualItems()]);

  // Reveal the container once content is committed (avoids staggered paint).
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
      className='relative'
      style={{ opacity: 0, transition: 'opacity 120ms ease' }}
    >
      {showSkeleton && skeleton}

      {showEmpty && <EmptyState title={emptyTitle} message={emptyMessage} />}

      {showContent && (
        <div
          ref={scrollRef}
          className='overflow-y-auto px-4 pt-4 pb-4 min-h-0'
          style={{
            maxHeight: 'calc(100vh - 340px)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)',
            maskImage:
              'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)',
          }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const isLoaderRow = virtualRow.index >= items.length;
              const item = items[virtualRow.index];

              // Loader row — shown at the bottom while fetching or when there's an error.
              if (isLoaderRow) {
                return (
                  <div
                    key='__loader__'
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {isError ? (
                      <div className='flex justify-center py-4'>
                        <button
                          type='button'
                          onClick={onRetry}
                          className='font-mono text-xs text-muted hover:text-fg transition-colors underline'
                        >
                          Failed to load more. Retry
                        </button>
                      </div>
                    ) : isFetching ? (
                      <div className='flex justify-center py-4 gap-2'>
                        {Array.from({ length: 3 }).map((_, i) => (
                          // eslint-disable-next-line react/no-array-index-key -- static loading indicator, order never changes
                          <div
                            key={`loading-dot-${i}`}
                            className='skeleton h-3 w-3 rounded-full animate-pulse'
                          />
                        ))}
                      </div>
                    ) : (
                      <div className='flex justify-center py-4'>
                        <span className='font-mono text-[11px] text-faint'>
                          Nothing more to load
                        </span>
                      </div>
                    )}
                  </div>
                );
              }

              if (!item) return null;

              // Spacer to create visual gap between items — rendered inside
              // the fixed-height row so it doesn't affect measurement.
              const spacer = itemClassName ? <div className={itemClassName} /> : null;

              return (
                <div
                  key={getItemKey(item, virtualRow.index)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <m.div
                    initial='initial'
                    animate='animate'
                    variants={listItemVariants}
                    transition={{ duration: 0.2, ease: 'easeOut' } as Transition}
                  >
                    {renderItem(item, virtualRow.index)}
                  </m.div>
                  {spacer}
                </div>
              );
            })}
          </div>

          {/* End spacer when everything is loaded */}
          {!isFetching && !isError && !hasMore && <div className='h-4' />}
        </div>
      )}
    </div>
  );
}

// Cast to preserve generic type through memo.
export const VirtualList = memo(VirtualListInner) as typeof VirtualListInner;

export default VirtualList;
