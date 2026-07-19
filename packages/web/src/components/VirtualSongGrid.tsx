import type { Playlist, Song } from '@alfira/server/shared';
import { useMasonry, usePositioner, useResizeObserver } from 'masonic';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
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
          // eslint-disable-next-line react/no-array-index-key -- static skeleton placeholders
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

  // rAF-batched scroll tracking + isScrolling flag (enables masonic's
  // will-change / pointer-events optimizations during scroll) + height
  // measurement via ResizeObserver.
  const { scrollTop, isScrolling, height: containerHeight } = useScrollObserver(scrollContainerRef);

  // Width: state initializer provides a reasonable fallback for SSR / first
  // page load. On subsequent mounts (view switches), a callback ref with
  // flushSync reads the real element width during commit and forces React
  // to process the state update synchronously before the browser paints.
  // A ResizeObserver handles subsequent layout changes.
  const [gridWidth, setGridWidth] = useState(() => {
    if (typeof window === 'undefined') return 960;
    return document.querySelector('main')?.clientWidth ?? 960;
  });

  const scrollRefCallback = useCallback((el: HTMLDivElement | null) => {
    scrollContainerRef.current = el;
    if (el) {
      flushSync(() => {
        setGridWidth(el.clientWidth);
      });
    }
  }, []);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setGridWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const positioner = usePositioner({
    width: gridWidth,
    columnWidth: 260,
    columnGutter: 0, // We handle padding in the render wrapper
  });
  const resizeObserver = useResizeObserver(positioner);

  // ── Infinite scroll trigger ────────────────────────────────────────
  const handleRender = useCallback(
    (_startIndex: number, stopIndex: number | undefined, _currentItems: Song[]) => {
      if (stopIndex !== undefined && stopIndex >= items.length - 10 && hasMore && !isFetching) {
        onFetchMore();
      }
    },
    [items.length, hasMore, isFetching, onFetchMore]
  );

  // ── Grid card renderer (stable component identity via refs) ─────────
  // The masonry render component must stay referentially stable across
  // re-renders. Changing component identity (e.g. when isAdminView
  // toggles) causes React to unmount + remount every visible card,
  // producing a visible flash. We store dynamic props in a ref so the
  // component type identity never changes.
  const cardPropsRef = useRef({
    isAdminView,
    playlists,
    onDelete,
    onPlay,
    playingId,
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
    playingId,
    onAddToQueue,
    selectionMode,
    isSelected,
    onToggleSelect,
  };

  const GridCard = useMemo(() => {
    const Component = ({
      index: _index,
      width,
      data: song,
    }: {
      index: number;
      width: number;
      data: Song;
    }) => {
      const p = cardPropsRef.current;
      return (
        <div style={{ width, padding: '0 8px 16px' }}>
          <SongCard
            song={song}
            variant='grid'
            isAdminView={p.isAdminView}
            playlists={p.playlists}
            onDelete={p.onDelete}
            onPlay={() => p.onPlay(song.id)}
            isPlaying={p.playingId === song.id}
            onAddToQueue={() => p.onAddToQueue(song.id)}
            selectionMode={p.selectionMode}
            isSelected={p.isSelected?.(song.id) ?? false}
            onToggleSelect={p.onToggleSelect ? () => p.onToggleSelect(song.id) : undefined}
          />
        </div>
      );
    };
    Component.displayName = 'GridCard';
    return Component;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable; dynamic values come from ref
  }, []);

  // ── Build the masonry ──────────────────────────────────────────────
  const showSkeleton = isLoading;
  const showEmpty = hasLoaded && items.length === 0;
  const isContentReady = !isLoading && hasLoaded && items.length > 0;

  const masonry = useMasonry({
    positioner,
    resizeObserver,
    items,
    scrollTop,
    isScrolling,
    height: containerHeight || 600,
    containerRef: masonryContainerRef,
    itemKey: (song: Song) => song.id,
    itemHeightEstimate: 330,
    overscanBy: 2,
    render: GridCard as React.ComponentType<{ index: number; width: number; data: unknown }>,
    onRender: isContentReady ? handleRender : undefined,
  });

  return (
    <div
      ref={scrollRefCallback}
      className='min-h-0'
      style={{
        maxHeight: 'calc(100vh - 340px)',
        overflowY: isContentReady ? 'auto' : 'hidden',
        WebkitMaskImage: isContentReady
          ? 'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)'
          : undefined,
        maskImage: isContentReady
          ? 'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)'
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
            // eslint-disable-next-line react/no-array-index-key -- static loading indicator
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
