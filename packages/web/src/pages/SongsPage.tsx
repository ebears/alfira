import type { Playlist, Song } from '@alfira-bot/server/shared';
import {
  ListIcon,
  MagnifyingGlassIcon,
  QuestionIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { deleteSong, getPlaylistsPage, getSongsPage, startPlayback } from '../api/api';
import ConfirmModal from '../components/ConfirmModal';
import NotificationToast from '../components/NotificationToast';
import { Button } from '../components/ui/Button';
import { VirtualSongList } from '../components/VirtualSongList';
import { useAdminView } from '../context/AdminViewContext';
import { usePlayerState } from '../context/PlayerContext';
import { useAddToQueue } from '../hooks/useAddToQueue';
import { useNotification } from '../hooks/useNotification';
import { onSocketEvent } from '../hooks/useSocket';
import { useVirtualizedInfiniteScroll } from '../hooks/useVirtualizedInfiniteScroll';
import { apiErrorMessage } from '../utils/api';

const ITEMS_PER_PAGE = 24;

export default function SongsPage() {
  const { isAdminView } = useAdminView();
  const { state: queueState } = usePlayerState();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('alfira-library-view');
    return saved === 'grid' ? 'grid' : 'list';
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { handleAddToQueue, notification } = useAddToQueue();
  const { notify } = useNotification();
  const handleSetDeleteId = useCallback((id: string | null) => setDeleteId(id), []);

  // Lazy playlists fetch
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  useEffect(() => {
    void getPlaylistsPage(isAdminView, 1, 100)
      .then((p) => setPlaylists(p.items))
      .catch(() => {
        /* Silently ignore playlist fetch error */
      });
  }, [isAdminView]);

  // Infinite scroll hook
  const {
    items,
    isLoading,
    isFetching,
    isError,
    hasMore,
    total,
    prepend,
    updateItem,
    removeItem,
    retry,
    sentinelRef,
  } = useVirtualizedInfiniteScroll<Song, [string]>({
    fetchPage: async (page, limit, searchQuery) => {
      const result = await getSongsPage(page, limit, searchQuery);
      return {
        items: result.items,
        hasMore: result.pagination.page < result.pagination.totalPages,
        total: result.pagination.total,
      };
    },
    limit: ITEMS_PER_PAGE,
    deps: [search],
  });

  // ---------------------------------------------------------------------------
  // Real-time socket wiring
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleSongAdded = (song: Song) => {
      prepend(song);
    };

    const handleSongUpdated = (song: Song) => {
      updateItem(song);
    };

    const handleSongDeleted = (id: string) => {
      removeItem(id);
    };

    const offAdded = onSocketEvent('songs:added', handleSongAdded);
    const offUpdated = onSocketEvent('songs:updated', handleSongUpdated);
    const offDeleted = onSocketEvent('songs:deleted', handleSongDeleted);

    return () => {
      offAdded();
      offUpdated();
      offDeleted();
    };
  }, [prepend, updateItem, removeItem]);

  const handleDelete = async (id: string) => {
    await deleteSong(id);
    setDeleteId(null);
    // Socket event will update the songs list
  };

  // ---------------------------------------------------------------------------
  // Play from song
  // ---------------------------------------------------------------------------
  const handlePlayFromSong = useCallback(
    async (songId: string) => {
      setPlayingId(songId);
      try {
        await startPlayback({
          mode: 'sequential',
          loop: queueState.loopMode,
          startFromSongId: songId,
        });
        notify('Started playback', 'success');
      } catch (err: unknown) {
        notify(
          apiErrorMessage(err, 'Could not start playback. Is the bot in a voice channel?'),
          'error',
          5000
        );
      } finally {
        setPlayingId(null);
      }
    },
    [queueState.loopMode, notify]
  );

  const isGrid = viewMode === 'grid';

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Songs</h1>
          <p className="font-mono text-xs text-muted mt-1">
            {isLoading ? '—' : `${total} track${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <span className="relative group">
          <QuestionIcon size={20} weight="duotone" className="text-muted cursor-help" />
          <span className="absolute right-0 top-full mt-2 w-64 p-3 rounded-lg bg-elevated border border-border text-xs text-muted opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 leading-relaxed">
            Songs are added through the <span className="text-accent">Requests</span> page. Submit a
            URL there — admins review and approve it, or it&rsquo;s added instantly if you have
            permission.
          </span>
        </span>
      </div>

      {/* Search and view toggle */}
      <div className="flex items-center gap-2 mb-4 md:mb-6">
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint w-4 h-4 md:w-3.5 md:h-3.5"
            weight="duotone"
          />
          <input
            className="input pl-10"
            placeholder="Search by title, nickname, artist, album, or tag..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant="inherit"
            surface="surface"
            size="icon"
            onClick={() => {
              setViewMode('list');
              localStorage.setItem('alfira-library-view', 'list');
            }}
            className={isGrid ? '' : 'pressed text-accent'}
            title="List view"
          >
            <ListIcon size={18} weight="duotone" />
          </Button>
          <Button
            variant="inherit"
            surface="surface"
            size="icon"
            onClick={() => {
              setViewMode('grid');
              localStorage.setItem('alfira-library-view', 'grid');
            }}
            className={isGrid ? 'pressed text-accent' : ''}
            title="Grid view"
          >
            <SquaresFourIcon size={18} weight="duotone" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <VirtualSongList
        items={items}
        viewMode={viewMode}
        isAdminView={isAdminView}
        playlists={playlists}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        hasMore={hasMore}
        playingId={playingId}
        onRetry={retry}
        sentinelRef={sentinelRef}
        onDelete={handleSetDeleteId}
        onPlay={handlePlayFromSong}
        onAddToQueue={handleAddToQueue}
      />

      {/* Modals */}

      {deleteId && (
        <DeleteConfirmDialog
          song={items.find((s) => s.id === deleteId)}
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {/* Notification Toast */}
      {notification && <NotificationToast notification={notification} />}
    </div>
  );
}

function DeleteConfirmDialog({
  song,
  onConfirm,
  onCancel,
}: {
  song: Song | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!song) return null;
  return (
    <ConfirmModal
      title="Delete Song"
      message={
        <>
          Remove <span className="text-fg font-semibold">"{song.nickname || song.title}"</span> from
          the library?{' '}
          <span className="font-mono text-xs text-danger/70">
            this will remove it from all playlists too.
          </span>
        </>
      }
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
