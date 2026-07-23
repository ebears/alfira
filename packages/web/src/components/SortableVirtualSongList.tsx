import { type Playlist, type Song } from '@alfira/server/shared';
import { DotsSixVerticalIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSongEdit } from '../context/SongEditContext';
import { SortableListProvider, useSortableItem } from '../hooks/useSortableVirtualList';
import SongCard from './SongCard';
import { VirtualList } from './VirtualList';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SortableVirtualSongListProps {
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
  onReorder: (orderedIds: string[]) => Promise<void>;
  emptyTitle: string;
  emptyMessage?: string;
  // Bulk selection
  selectionMode?: boolean;
  isSelected?: (id: string) => boolean;
  onToggleSelect?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Item wrapper with drag handle
// ---------------------------------------------------------------------------

/** Height of an expanded row (card + edit panel + spacer). */
const EXPANDED_ROW_HEIGHT = 540;
/** Height of a collapsed song row (card + spacer). */
const COLLAPSED_ROW_HEIGHT = 105;

interface SortableSongItemProps {
  song: Song;
  index: number;
  isAdminView: boolean;
  playlists: Playlist[];
  playingId: string | null;
  selectionMode: boolean;
  isSelected: boolean;
  onDelete?: (id: string) => void;
  onPlay: (id: string) => void;
  onAddToQueue: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}

const SortableSongItem = memo(function SortableSongItem({
  song,
  index,
  isAdminView,
  playlists,
  playingId,
  selectionMode,
  isSelected,
  onDelete,
  onPlay,
  onAddToQueue,
  onToggleSelect,
}: SortableSongItemProps) {
  const { itemRef, dragHandleRef, isDragging, isAnyDragging, isDropTarget } = useSortableItem(
    song.id,
    index
  );

  const handlePlay = useCallback(() => {
    onPlay(song.id);
  }, [onPlay, song.id]);
  const handleAddToQueue = useCallback(() => {
    onAddToQueue(song.id);
  }, [onAddToQueue, song.id]);
  const handleToggleSelect = useCallback(
    () => onToggleSelect?.(song.id),
    [onToggleSelect, song.id]
  );

  return (
    <div ref={itemRef} className='group relative flex items-center'>
      {/* Drop target highlight */}
      {isDropTarget && (
        <div className='bg-accent/10 pointer-events-none absolute inset-0 z-10 rounded-lg' />
      )}

      {/* Drag handle — visible on row hover, always visible during any drag */}
      <button
        ref={dragHandleRef}
        type='button'
        className={`text-faint hover:text-muted -mr-0.5 ml-0.5 shrink-0 cursor-grab rounded opacity-0 transition-opacity active:cursor-grabbing ${isAnyDragging ? 'opacity-100' : 'group-hover:opacity-100'}`}
        aria-label={`Drag to reorder "${song.nickname ?? song.title}"`}
      >
        <DotsSixVerticalIcon size={18} weight='bold' />
      </button>

      <div className={`min-w-0 flex-1 transition-opacity ${isDragging ? 'opacity-50' : ''}`}>
        <SongCard
          song={song}
          variant='list'
          isAdminView={isAdminView}
          playlists={playlists}
          onDelete={onDelete}
          onPlay={handlePlay}
          isPlaying={playingId === song.id}
          onAddToQueue={handleAddToQueue}
          selectionMode={selectionMode}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect ? handleToggleSelect : undefined}
        />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const SKELETON_KEYS = ['sk-0', 'sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6', 'sk-7'];

function SkeletonList() {
  return (
    <div className='flex flex-col gap-1.5'>
      {SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className='bg-elevated clay-resting flex items-center gap-3 rounded-lg px-4 py-4 md:gap-4'
        >
          <div className='bg-surface h-16 w-16 shrink-0 animate-pulse rounded border' />
          <div className='flex min-w-0 flex-1 flex-col gap-2'>
            <div className='bg-surface h-3.5 w-2/5 animate-pulse rounded' />
            <div className='bg-surface h-3 w-3/5 animate-pulse rounded' />
          </div>
          <div className='bg-surface h-6 w-6 shrink-0 animate-pulse rounded' />
          <div className='bg-surface h-4 w-4 shrink-0 animate-pulse rounded' />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const SortableVirtualSongList = memo(function SortableVirtualSongList({
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
  onReorder,
  emptyTitle,
  emptyMessage,
  selectionMode = false,
  isSelected,
  onToggleSelect,
}: SortableVirtualSongListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { openSongId } = useSongEdit();

  // Track the "effective" open song for layout — same pattern as VirtualSongList.
  const [effectiveOpenId, setEffectiveOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (openSongId) {
      setEffectiveOpenId(openSongId);
    } else {
      const timeout = setTimeout(() => {
        setEffectiveOpenId(null);
      }, 300);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [openSongId]);

  // Build the ordered ID list for the provider
  const songIds = useMemo(() => items.map((s) => s.id), [items]);

  const getItemKey = useCallback((song: Song) => song.id, []);

  const renderItem = useCallback(
    (song: Song, index: number) => (
      <SortableSongItem
        song={song}
        index={index}
        isAdminView={isAdminView}
        playlists={playlists}
        playingId={playingId}
        selectionMode={selectionMode}
        isSelected={isSelected?.(song.id) ?? false}
        onDelete={onDelete}
        onPlay={onPlay}
        onAddToQueue={onAddToQueue}
        onToggleSelect={onToggleSelect}
      />
    ),
    [
      isAdminView,
      playlists,
      playingId,
      selectionMode,
      isSelected,
      onDelete,
      onPlay,
      onAddToQueue,
      onToggleSelect,
    ]
  );

  const estimateSize = useCallback(
    (index: number) => {
      return items[index]?.id === effectiveOpenId ? EXPANDED_ROW_HEIGHT : COLLAPSED_ROW_HEIGHT;
    },
    [items, effectiveOpenId]
  );

  const skeleton = useMemo(() => <SkeletonList />, []);

  return (
    <SortableListProvider itemIds={songIds} onReorder={onReorder} scrollContainerRef={scrollRef}>
      <VirtualList
        items={items}
        getItemKey={getItemKey}
        renderItem={renderItem}
        estimateSize={estimateSize}
        scrollRef={scrollRef}
        itemClassName='pb-3'
        isLoading={isLoading}
        hasLoaded={hasLoaded}
        isFetching={isFetching}
        isError={isError}
        hasMore={hasMore}
        onRetry={onRetry}
        onFetchMore={onFetchMore}
        skeleton={skeleton}
        emptyTitle={emptyTitle}
        emptyMessage={emptyMessage}
      />
    </SortableListProvider>
  );
});

export default SortableVirtualSongList;
