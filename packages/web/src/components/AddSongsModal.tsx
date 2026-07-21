import { type PlaylistDetail, type Song } from '@alfira/server/shared';
import { formatDuration } from '@alfira/server/shared';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { addSongToPlaylist, getSongsPage } from '../api/api';
import { Backdrop } from './Backdrop';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import { Skeleton } from './ui/Skeleton';
import { SpringUp } from './ui/SpringUp';
import { VirtualList } from './VirtualList';

const PAGE_SIZE = 30;

export default function AddSongsModal({
  playlist,
  onClose,
  onAdded,
}: {
  playlist: PlaylistDetail;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set(playlist.songs.map((ps) => ps.songId)));
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // eslint-disable-next-line unicorn/no-useless-undefined
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Stable refs so callbacks don't trigger virtualizer re-indexing.
  const hasMoreRef = useRef(true);
  const isFetchingRef = useRef(false);
  const pageRef = useRef(1);
  const debouncedSearchRef = useRef('');
  const mountedRef = useRef(true);
  hasMoreRef.current = hasMore;
  isFetchingRef.current = isFetching;
  pageRef.current = page;
  debouncedSearchRef.current = debouncedSearch;

  // Reset and fetch page 1 when debounced search changes.
  useEffect(() => {
    mountedRef.current = true;
    setSongs([]);
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    hasMoreRef.current = true;
    setIsLoading(true);
    setHasLoaded(false);
    setIsError(false);

    void (async () => {
      try {
        const result = await getSongsPage(1, PAGE_SIZE, {
          search: debouncedSearch || undefined,
        });
        if (!mountedRef.current) {
          return;
        }
        setSongs(result.items);
        setHasMore(result.items.length >= PAGE_SIZE);
        hasMoreRef.current = result.items.length >= PAGE_SIZE;
      } catch {
        if (!mountedRef.current) {
          return;
        }
        setIsError(true);
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [debouncedSearch]);

  // Debounce search input.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [search]);

  const fetchMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;
    setIsFetching(true);
    const nextPage = pageRef.current + 1;
    void (async () => {
      try {
        const result = await getSongsPage(nextPage, PAGE_SIZE, {
          search: debouncedSearchRef.current || undefined,
        });
        if (!mountedRef.current) {
          return;
        }
        setSongs((prev) => [...prev, ...result.items]);
        setPage(nextPage);
        pageRef.current = nextPage;
        setHasMore(result.items.length >= PAGE_SIZE);
        hasMoreRef.current = result.items.length >= PAGE_SIZE;
      } catch {
        if (!mountedRef.current) {
          return;
        }
        setIsError(true);
      } finally {
        if (mountedRef.current) {
          setIsFetching(false);
          isFetchingRef.current = false;
        }
      }
    })();
  }, []);

  const retry = useCallback(() => {
    setIsError(false);
    fetchMore();
  }, [fetchMore]);

  const handleAdd = useCallback(
    async (song: Song) => {
      setAdding((prev) => new Set([...prev, song.id]));
      try {
        await addSongToPlaylist(playlist.id, song.id);
        setAdded((prev) => new Set([...prev, song.id]));
      } catch {
        // Already in playlist — mark as added regardless.
        setAdded((prev) => new Set([...prev, song.id]));
      } finally {
        setAdding((prev) => {
          const n = new Set(prev);
          n.delete(song.id);
          return n;
        });
      }
    },
    [playlist.id]
  );

  const hasAddedNew = added.size > playlist.songs.length;

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  // Stable callbacks for VirtualList.
  const estimateSize = useCallback(() => 60, []);
  const getItemKey = useCallback((song: Song) => song.id, []);

  const renderItem = useCallback(
    (song: Song) => (
      <SongRow
        song={song}
        isAdded={added.has(song.id)}
        isAdding={adding.has(song.id)}
        onAdd={handleAdd}
      />
    ),
    [added, adding, handleAdd]
  );

  const skeleton = useMemo(
    () => (
      <div className='space-y-2 p-4 md:p-6'>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={`skeleton-${n}`} className='flex items-center gap-3'>
            <Skeleton className='h-8 w-12 rounded md:h-7 md:w-10' />
            <Skeleton className='h-3 flex-1' />
          </div>
        ))}
      </div>
    ),
    []
  );

  return (
    <Backdrop onClose={onClose}>
      <SpringUp className='glass-modal flex max-h-[80vh] w-full max-w-lg flex-col'>
        <div className='border-border border-b p-4 md:p-5'>
          <h2 className='font-display text-fg text-2xl tracking-wider md:text-3xl'>Add Songs</h2>
          <p className='text-muted mt-0.5 font-mono text-xs'>to &quot;{playlist.name}&quot;</p>
          <input
            className='input mt-3 md:mt-4'
            placeholder='Search...'
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        <VirtualList
          items={songs}
          getItemKey={getItemKey}
          renderItem={renderItem}
          estimateSize={estimateSize}
          isLoading={isLoading}
          hasLoaded={hasLoaded}
          isFetching={isFetching}
          isError={isError}
          hasMore={hasMore}
          onRetry={retry}
          onFetchMore={fetchMore}
          skeleton={skeleton}
          emptyTitle='No Songs'
          emptyMessage='No songs found matching your search.'
        />

        <div className='border-border flex justify-end border-t p-4'>
          <Button variant='primary' onClick={hasAddedNew ? onAdded : onClose}>
            {hasAddedNew ? 'Done' : 'Close'}
          </Button>
        </div>
      </SpringUp>
    </Backdrop>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const SongRow = memo(function SongRow({
  song,
  isAdded,
  isAdding,
  onAdd,
}: {
  song: Song;
  isAdded: boolean;
  isAdding: boolean;
  onAdd: (song: Song) => void;
}) {
  const handleClick = useCallback(() => {
    onAdd(song);
  }, [onAdd, song]);

  return (
    <div className='hover:bg-elevated active:bg-elevated/80 flex items-center gap-2 px-4 py-3 transition-colors duration-100 md:gap-3 md:px-5'>
      <div className='border-border bg-elevated h-10 w-10 shrink-0 overflow-hidden rounded border md:h-8 md:w-8'>
        <ArtworkImage
          src={song.artwork ?? song.thumbnailUrl}
          alt={song.nickname ?? song.title}
          className='h-full w-full'
          imageClassName='scale-[1.33]'
        />
      </div>
      <span className='font-body text-fg flex-1 truncate text-sm'>
        {song.nickname ?? song.title}
      </span>
      <span className='text-muted hidden font-mono text-xs sm:block'>
        {formatDuration(song.duration)}
      </span>
      <Button
        variant='inherit'
        surface='surface'
        disabled={isAdded || isAdding}
        onClick={handleClick}
        className={`min-h-11 px-3 py-2 font-mono text-xs md:min-h-0 md:py-1 ${
          isAdded ? 'border-accent/30 text-accent bg-accent/5 cursor-default' : ''
        }`}
      >
        {isAdding ? '...' : isAdded ? '✓' : 'add'}
      </Button>
    </div>
  );
});
