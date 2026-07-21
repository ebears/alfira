import { type PlaylistDetail, type Song } from '@alfira/server/shared';
import { formatDuration } from '@alfira/server/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { addSongToPlaylist, getSongsPage } from '../api/api';
import { Backdrop } from './Backdrop';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import { Skeleton } from './ui/Skeleton';
import { SpringUp } from './ui/SpringUp';

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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set(playlist.songs.map((ps) => ps.songId)));
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // eslint-disable-next-line unicorn/no-useless-undefined
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stable refs to avoid recreating callbacks on every render
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const debouncedSearchRef = useRef('');
  const pageRef = useRef(1);
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;
  debouncedSearchRef.current = debouncedSearch;
  pageRef.current = page;

  // Reset and fetch page 1 on search change
  useEffect(() => {
    setSongs([]);
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    setLoading(true);
    debouncedSearchRef.current = debouncedSearch;
    void (async () => {
      const result = await getSongsPage(1, PAGE_SIZE, { search: debouncedSearch || undefined });
      setSongs(result.items);
      setHasMore(result.items.length >= PAGE_SIZE);
      hasMoreRef.current = result.items.length >= PAGE_SIZE;
      setLoading(false);
    })();
  }, [debouncedSearch]);

  // Debounce search input
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

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    void (async () => {
      const result = await getSongsPage(nextPage, PAGE_SIZE, {
        search: debouncedSearchRef.current || undefined,
      });
      setSongs((prev) => [...prev, ...result.items]);
      setPage(nextPage);
      pageRef.current = nextPage;
      setHasMore(result.items.length >= PAGE_SIZE);
      hasMoreRef.current = result.items.length >= PAGE_SIZE;
      loadingMoreRef.current = false;
      setLoadingMore(false);
    })();
  }, []);

  // Check near-bottom on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const check = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
        loadMore();
      }
    };
    el.addEventListener('scroll', check, { passive: true });
    return () => {
      el.removeEventListener('scroll', check);
    };
  }, [loadMore]);

  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const handleAdd = useCallback(
    async (song: Song) => {
      setAdding((prev) => new Set([...prev, song.id]));
      try {
        await addSongToPlaylist(playlist.id, song.id);
        setAdded((prev) => new Set([...prev, song.id]));
      } catch {
        /* already added — mark as added */
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

  const virtualContainerStyle = useMemo(
    () => ({
      height: `${virtualizer.getTotalSize()}px`,
      position: 'relative' as const,
    }),
    [virtualizer]
  );

  return (
    <Backdrop onClose={onClose}>
      <SpringUp className='glass-modal flex max-h-[80vh] w-full max-w-lg flex-col'>
        <div className='border-border border-b p-4 md:p-5'>
          <h2 className='font-display text-fg text-2xl tracking-wider md:text-3xl'>Add Songs</h2>
          <p className='text-muted mt-0.5 font-mono text-xs'>to "{playlist.name}"</p>
          <input
            className='input mt-3 md:mt-4'
            placeholder='Search...'
            value={search}
            onChange={handleSearchChange}
          />
        </div>
        <div ref={scrollRef} className='flex-1 overflow-y-auto'>
          {loading ? (
            <div className='space-y-2 p-4 md:p-6'>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={`skeleton-${n}`} className='flex items-center gap-3'>
                  <Skeleton className='h-8 w-12 rounded md:h-7 md:w-10' />
                  <Skeleton className='h-3 flex-1' />
                </div>
              ))}
            </div>
          ) : songs.length === 0 ? (
            <p className='text-muted p-4 text-center font-mono text-xs md:p-6'>no songs found</p>
          ) : (
            <div style={virtualContainerStyle}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const song = songs[virtualRow.index];
                if (song == null) {
                  return null;
                }
                const isAdded = added.has(song.id);
                const isAdding = adding.has(song.id);
                return (
                  <div
                    key={song.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    /* eslint-disable-next-line react-perf/jsx-no-new-object-as-prop -- per-row dynamic transform from virtualizer */
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <SongRow song={song} isAdded={isAdded} isAdding={isAdding} onAdd={handleAdd} />
                  </div>
                );
              })}
            </div>
          )}
          {loadingMore && (
            <p className='text-muted p-3 text-center font-mono text-xs'>loading...</p>
          )}
        </div>

        <div className='border-border flex justify-end border-t p-4'>
          <Button variant='primary' onClick={hasAddedNew ? onAdded : onClose}>
            {hasAddedNew ? 'Done' : 'Close'}
          </Button>
        </div>
      </SpringUp>
    </Backdrop>
  );
}

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
