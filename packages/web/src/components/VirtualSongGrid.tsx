import type { Playlist, Song } from '@alfira/server/shared';
import { useMasonry, usePositioner, useResizeObserver } from 'masonic';
import { memo, useCallback, useMemo, useRef } from 'react';
import { useScrollObserver } from '../hooks/useScrollObserver';
import SongCard from './SongCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VirtualSongGridProps {
  items: Song[];
  isAdminView: boolean;
  playlists: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  hasLoaded: boolean;
  playingId: string | null;
  onRetry: () => void;
  onFetchMore: () => void;
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

/** Composite item passed to masonic so isPlaying changes trigger re-renders. */
interface GridSongItem {
  song: Song;
  isPlaying: boolean;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonGrid() {
  return (
    <div className='px-4 pt-4'>
      <div
        className='grid gap-4'
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className='rounded-lg bg-elevated clay-resting overflow-hidden'
          >
            <div className='skeleton aspect-square m-3 rounded-lg' />
            <div className='p-4 flex flex-col gap-2'>
              <div className='skeleton h-3.5 w-3/5' />
              <div className='skeleton h-3 w-4/5' />
              <div className='skeleton h-3 w-2/5' />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const VirtualSongGrid = memo(function VirtualSongGrid({
  items,
  isAdminView,
  playlists,
  isLoading,
  isFetching,
  isError,
  hasMore,
  hasLoaded,
  playingId,
  onRetry,
  onFetchMore,
  onDelete,
  onPlay,
  onAddToQueue,
  emptyTitle,
  emptyMessage,
  selectionMode = false,
  isSelected,
  onToggleSelect,
}: VirtualSongGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const masonryContainerRef = useRef<HTMLDivElement>(null);

  // rAF-batched scroll + isScrolling + size tracking via a single
  // ResizeObserver. Width is throttled (see useScrollObserver) to avoid
  // recalculating masonry columns on every frame during animated resizes.
  const {
    scrollTop,
    isScrolling,
    height: containerHeight,
    width: gridWidth,
  } = useScrollObserver(scrollContainerRef);

  // Callback ref wires the DOM node into scrollContainerRef so
  // useScrollObserver can observe it. React attaches refs before
  // useLayoutEffect, so the hook sees the element on first pass.
  const scrollRefCallback = useCallback((el: HTMLDivElement | null) => {
    scrollContainerRef.current = el;
  }, []);

  const positioner = usePositioner({
    width: gridWidth,
    columnWidth: 260,
    columnGutter: 0, // We handle padding in the render wrapper
  });
  const resizeObserver = useResizeObserver(positioner);

  // ── Infinite scroll trigger ────────────────────────────────────────
  const handleRender = useCallback(
    (_startIndex: number, stopIndex: number | undefined, _currentItems: GridSongItem[]) => {
      if (stopIndex !== undefined && stopIndex >= items.length - 10 && hasMore && !isFetching) {
        onFetchMore();
      }
    },
    [items.length, hasMore, isFetching, onFetchMore]
  );

  // ── Grid items (song + playing state) ──────────────────────────────
  // Bundling isPlaying into the item data lets masonic detect playingId
  // changes as data changes and update cards in-place (same itemKey = no
  // unmount/remount flash). The GridCard render component stays memoized
  // with empty deps so its identity is stable across all re-renders.
  const gridItems: GridSongItem[] = useMemo(
    () => items.map((song) => ({ song, isPlaying: playingId === song.id })),
    [items, playingId]
  );

  // ── Grid card renderer (stable component identity via refs) ─────────
  // The masonry render component must stay referentially stable across
  // re-renders. Changing component identity (e.g. when isAdminView
  // toggles) causes React to unmount + remount every visible card,
  // producing a visible flash. We store dynamic props in a ref so the
  // component type identity never changes.
  //
  // NB: playingId is NOT in the ref because it lives in gridItems (above);
  // masonic re-renders individual cards when isPlaying flips without
  // changing the render function identity.
  const cardPropsRef = useRef({
    isAdminView,
    playlists,
    onDelete,
    onPlay,
    onAddToQueue,
    selectionMode,
    isSelected,
    onToggleSelect,
  });
  cardPropsRef.current = {
    isAdminView,
    playlists,
    onDelete,
    onPlay,
    onAddToQueue,
    selectionMode,
    isSelected,
    onToggleSelect,
  };

  const GridCard = useMemo(() => {
    const Component = ({
      index: _index,
      width,
      data: { song, isPlaying },
    }: {
      index: number;
      width: number;
      data: GridSongItem;
    }) => {
      const p = cardPropsRef.current;
      return (
        <div style={{ width, padding: '0 6px 16px' }}>
          <SongCard
            song={song}
            variant='grid'
            isAdminView={p.isAdminView}
            playlists={p.playlists}
            onDelete={p.onDelete}
            onPlay={() => p.onPlay(song.id)}
            isPlaying={isPlaying}
            onAddToQueue={() => p.onAddToQueue(song.id)}
            selectionMode={p.selectionMode}
            isSelected={p.isSelected?.(song.id) ?? false}
            onToggleSelect={p.onToggleSelect ? () => p.onToggleSelect?.(song.id) : undefined}
          />
        </div>
      );
    };
    Component.displayName = 'GridCard';
    return Component;
  }, []);

  // ── Build the masonry ──────────────────────────────────────────────
  const showSkeleton = isLoading;
  const showEmpty = hasLoaded && items.length === 0;
  const isContentReady = !isLoading && hasLoaded && items.length > 0;

  // Pre-populate the positioner with estimated heights for items that
  // haven't been measured yet. This prevents the visible flash of items
  // jumping from estimated positions to measured positions — they start
  // at near-correct positions and the ResizeObserver refines async.
  // 420px ≈ typical grid card height at common column widths (thumbnail
  // ~260-280px + info ~100px + wrapper padding 16px).
  const posSize = positioner.size();
  if (posSize < items.length) {
    for (let i = posSize; i < items.length; i++) {
      positioner.set(i, 420);
    }
  }

  const masonry = useMasonry({
    positioner,
    resizeObserver,
    items: gridItems,
    scrollTop,
    isScrolling,
    height: containerHeight || 600,
    containerRef: masonryContainerRef,
    itemKey: (item: GridSongItem) => item.song.id,
    itemHeightEstimate: 330,
    overscanBy: 2,
    render: GridCard,
    onRender: isContentReady ? handleRender : undefined,
  });

  return (
    <div
      ref={scrollRefCallback}
      className='pt-3 min-h-0 flex-1'
      style={{
        overflowX: 'hidden',
        overflowY: isContentReady ? 'auto' : 'hidden',
        WebkitMaskImage: isContentReady
          ? 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)'
          : undefined,
        maskImage: isContentReady
          ? 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)'
          : undefined,
      }}
    >
      {showSkeleton && <SkeletonGrid />}

      {showEmpty && (
        <div className='px-4 pt-4'>
          <div className='text-center py-16'>
            <p className='text-fg font-semibold'>{emptyTitle}</p>
            {emptyMessage && <p className='text-muted text-sm mt-1'>{emptyMessage}</p>}
          </div>
        </div>
      )}

      {/* Masonry is always in the DOM (ref attachment) but hidden until content is ready */}
      <div style={{ display: isContentReady ? undefined : 'none' }}>{masonry}</div>

      {isContentReady && isFetching && (
        <div className='flex justify-center py-4 gap-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`loading-dot-${i}`} className='skeleton h-3 w-3 rounded-full animate-pulse' />
          ))}
        </div>
      )}

      {isContentReady && isError && (
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
    </div>
  );
});

export default VirtualSongGrid;
