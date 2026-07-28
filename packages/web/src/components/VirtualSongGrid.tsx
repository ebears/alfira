import { type Playlist, type Song } from '@alfira/server/shared';
import { DotsSixVerticalIcon } from '@phosphor-icons/react';
import { useMasonry, usePositioner, useResizeObserver } from 'masonic';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import { useScrollObserver } from '../hooks/useScrollObserver';
import { SortableGridProvider, useSortableGridItem } from '../hooks/useSortableMasonicGrid';
import SongCard from './SongCard';
import { Skeleton } from './ui/Skeleton';

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
  // Drag-and-drop reorder (masonic grid)
  sortable?: boolean;
  onReorder?: (orderedIds: string[]) => Promise<void>;
}

/** Composite item passed to masonic so state changes trigger re-renders. */
interface GridSongItem {
  song: Song;
  isPlaying: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  /** Included so masonic re-renders cards when admin view toggles. */
  isAdminView: boolean;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const SKELETON_GRID_STYLE = {
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
} as const;

function SkeletonGrid() {
  return (
    <div className='px-4 pt-4'>
      <div className='grid gap-4' style={SKELETON_GRID_STYLE}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className='bg-elevated clay-resting overflow-hidden rounded-lg'
          >
            <Skeleton className='m-3 aspect-square rounded-lg' />
            <div className='flex flex-col gap-2 p-4'>
              <Skeleton className='h-3.5 w-3/5' />
              <Skeleton className='h-3 w-4/5' />
              <Skeleton className='h-3 w-2/5' />
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
  sortable = false,
  onReorder,
}: VirtualSongGridProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const masonryContainerRef = useRef<HTMLDivElement>(null);

  // Refs don't trigger effect re-runs, so mirror the grid element in
  // state. SortableGridProvider uses this state as a dep so its drop
  // target registration fires when the masonry container mounts.
  const [gridElement, setGridElement] = useState<HTMLElement | null>(null);
  const gridContainerCallback = useCallback((el: HTMLElement) => {
    masonryContainerRef.current = el as HTMLDivElement;
    setGridElement(el);
  }, []);

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

  // Store positioner in a ref so SortableGridProvider can access it for
  // hit-testing during drag operations.
  const positionerRef = useRef(positioner);
  positionerRef.current = positioner;

  // Stable ID array for the sortable provider
  const songIds = useMemo(() => items.map((s) => s.id), [items]);

  // ── Infinite scroll trigger ────────────────────────────────────────
  const handleRender = useCallback(
    (_startIndex: number, stopIndex: number | undefined, _currentItems: GridSongItem[]) => {
      if (stopIndex !== undefined && stopIndex >= items.length - 10 && hasMore && !isFetching) {
        onFetchMore();
      }
    },
    [items.length, hasMore, isFetching, onFetchMore]
  );

  // ── Grid items (song + dynamic state) ───────────────────────────────
  // Bundling isPlaying / selectionMode / isSelected into the item data
  // lets masonic detect changes and update cards in-place (same itemKey =
  // no unmount/remount flash). The GridCard render component stays
  // memoized with empty deps so its identity is stable across re-renders.
  // isAdminView is included in GridSongItem so masonic re-renders cards
  // when the admin/user view toggles. The gridItems array reference must
  // change for masonic to detect the update (keys alone don't trigger
  // re-renders). Card no longer changes element type when hoverable flips,
  // so this re-render won't cause artwork flashes.
  const gridItems: GridSongItem[] = useMemo(
    () =>
      items.map((song) => ({
        song,
        isPlaying: playingId === song.id,
        selectionMode,
        isSelected: isSelected?.(song.id) ?? false,
        isAdminView,
      })),
    [items, playingId, selectionMode, isSelected, isAdminView]
  );

  // ── Grid card renderer (stable component identity via refs) ─────────
  // The masonry render component must stay referentially stable across
  // re-renders. Changing component identity (e.g. when isAdminView
  // toggles) causes React to unmount + remount every visible card,
  // producing a visible flash. We store dynamic props in a ref so the
  // component type identity never changes.
  //
  // DnB: playingId / selectionMode / isSelected live in gridItems (above);
  // masonic re-renders individual cards when these flip without changing
  // the render function identity. Callbacks and stable props go in the ref.
  //
  // Sortable drag-and-drop: useSortableGridItem is called unconditionally
  // (hooks rules). When there is no SortableGridProvider in the tree
  // (sortable=false), it returns no-op refs and isEnabled=false, so no
  // drag handles are rendered and no draggable behaviour is attached.
  const cardPropsRef = useRef({
    isAdminView,
    playlists,
    onDelete,
    onPlay,
    onAddToQueue,
    onToggleSelect,
  });
  cardPropsRef.current = {
    isAdminView,
    playlists,
    onDelete,
    onPlay,
    onAddToQueue,
    onToggleSelect,
  };

  const GridCard = useMemo(() => {
    function Component({
      index,
      width,
      data: { song, isPlaying, selectionMode: sel, isSelected: selSelected },
    }: {
      index: number;
      width: number;
      data: GridSongItem;
    }) {
      const p = cardPropsRef.current;
      const {
        itemRef,
        dragHandleRef,
        isDragging,
        isAnyDragging,
        isDropTarget,
        isEnabled: isSortable,
      } = useSortableGridItem(song.id, index);

      return (
        <div ref={itemRef} style={{ width, padding: '0 6px 16px' }} className='group relative'>
          {/* Drop target highlight */}
          {isDropTarget && (
            <div className='bg-accent/10 pointer-events-none absolute inset-0 z-10 rounded-lg' />
          )}

          {/* Drag handle — rendered only when sortable is enabled */}
          {isSortable && (
            <button
              ref={dragHandleRef}
              type='button'
              style={{ position: 'absolute', bottom: 24, left: 8, zIndex: 20 }}
              className={`text-faint hover:text-muted cursor-grab rounded p-1 opacity-0 transition-opacity active:cursor-grabbing ${isAnyDragging ? 'opacity-100' : 'group-hover:opacity-100'}`}
              aria-label={`Drag to reorder "${song.nickname ?? song.title}"`}
            >
              <DotsSixVerticalIcon size={18} weight='bold' />
            </button>
          )}

          {/* Card content — dimmed while this item is being dragged */}
          <div className={`min-w-0 transition-opacity ${isDragging ? 'opacity-50' : ''}`}>
            <SongCard
              song={song}
              variant='grid'
              isAdminView={p.isAdminView}
              playlists={p.playlists}
              onDelete={p.onDelete}
              onPlay={() => {
                p.onPlay(song.id);
              }}
              isPlaying={isPlaying}
              onAddToQueue={() => {
                p.onAddToQueue(song.id);
              }}
              selectionMode={sel}
              isSelected={selSelected}
              onToggleSelect={p.onToggleSelect ? () => p.onToggleSelect?.(song.id) : undefined}
            />
          </div>
        </div>
      );
    }
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

  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const masonry = useMasonry({
    positioner,
    resizeObserver,
    items: gridItems,
    scrollTop,
    isScrolling,
    height: containerHeight || 600,
    containerRef: gridContainerCallback,
    itemKey: (item: GridSongItem) => item.song.id,
    itemHeightEstimate: 330,
    overscanBy: 2,
    render: GridCard,
    onRender: isContentReady ? handleRender : undefined,
  });

  const scrollStyle = useMemo(
    () => ({
      overflowX: 'hidden' as const,
      overflowY: isContentReady ? ('auto' as const) : ('hidden' as const),
      WebkitMaskImage: isContentReady
        ? 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)'
        : undefined,
      maskImage: isContentReady
        ? 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%)'
        : undefined,
    }),
    [isContentReady]
  );

  const masonryWrapperStyle = useMemo(
    () => ({ display: isContentReady ? undefined : ('none' as const) }),
    [isContentReady]
  );

  const gridContent = (
    <div ref={scrollRefCallback} className='min-h-0 flex-1 pt-3' style={scrollStyle}>
      {showSkeleton && <SkeletonGrid />}

      {showEmpty && (
        <div className='px-4 pt-4'>
          <div className='py-16 text-center'>
            <p className='text-fg font-semibold'>{emptyTitle}</p>
            {emptyMessage && <p className='text-muted mt-1 text-sm'>{emptyMessage}</p>}
          </div>
        </div>
      )}

      {/* Masonry is always in the DOM (ref attachment) but hidden until content is ready */}
      <div style={masonryWrapperStyle}>{masonry}</div>

      {isContentReady && isFetching && (
        <div className='flex justify-center gap-2 py-4'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`loading-dot-${i}`}
              className='bg-border h-3 w-3 animate-pulse rounded-full'
            />
          ))}
        </div>
      )}

      {isContentReady && isError && (
        <div className='flex justify-center py-4'>
          <button
            type='button'
            onClick={onRetry}
            className='text-muted hover:text-fg font-mono text-xs underline transition-colors'
          >
            Failed to load more. Retry
          </button>
        </div>
      )}
    </div>
  );

  // When sortable is enabled, wrap with the sortable context provider so
  // grid cards can register draggable handles and the container acts as
  // a drop target with positioner-based hit-testing.
  if (sortable && onReorder) {
    return (
      <SortableGridProvider
        itemIds={songIds}
        onReorder={onReorder}
        scrollContainerRef={scrollContainerRef}
        positionerRef={positionerRef}
        gridElement={gridElement}
      >
        {gridContent}
      </SortableGridProvider>
    );
  }

  return gridContent;
});

export default VirtualSongGrid;
