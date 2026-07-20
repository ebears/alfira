import type { Playlist, Song } from '@alfira/server/shared';
import type { BulkEditData, FetchSongsOptions } from '@alfira/server/shared/api';
import { MusicNotesIcon, QuestionIcon } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pageVariants, viewTransition } from '../lib/motion';
import {
  bulkDeleteSongs,
  bulkEditSongs,
  deleteSong,
  getPlaylistsPage,
  getSongsPage,
  startPlayback,
} from '../api/api';
import BulkActionBar from '../components/BulkActionBar';
import BulkEditModal from '../components/BulkEditModal';
import ConfirmModal from '../components/ConfirmModal';
import ListToolbar from '../components/ListToolbar';

import NotificationToast from '../components/NotificationToast';

import { PageHeader } from '../components/ui/PageHeader';
import { VirtualSongGrid } from '../components/VirtualSongGrid';
import { VirtualSongList } from '../components/VirtualSongList';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';
import { usePlayerState } from '../context/PlayerContext';
import { useAddToQueue } from '../hooks/useAddToQueue';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { useNotification } from '../hooks/useNotification';
import { onSocketEvent } from '../hooks/useSocket';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { apiErrorMessage, notifyUnlessRateLimit } from '../utils/api';

const ITEMS_PER_PAGE = 48;

type SortField = 'createdAt' | 'title' | 'artist' | 'album' | 'duration';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'createdAt', label: 'Date Added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'duration', label: 'Duration' },
];

export default function SongsPage() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();
  const { state: queueState } = usePlayerState();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { handleAddToQueue, notification } = useAddToQueue();
  const { notify } = useNotification();
  const handleSetDeleteId = useCallback((id: string | null) => setDeleteId(id), []);

  // Bulk selection
  const bulk = useBulkSelection();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('alfira-song-view') as 'list' | 'grid' | null) ?? 'list'
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkEditingOpen, setBulkEditingOpen] = useState(false);
  const [bulkEditingApplying, setBulkEditingApplying] = useState(false);

  const canDelete = isAdminView || hasPermission('songs.delete');
  const canEdit = isAdminView || hasPermission('songs.edit');
  const canBulk = canDelete || canEdit;

  // ── URL params ──────────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const sort = (searchParams.get('sort') as SortField | null) ?? 'createdAt';
  const order = searchParams.get('order') ?? 'desc';
  const filterTags = useMemo(
    () =>
      searchParams
        .get('tags')
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean) ?? [],
    [searchParams]
  );
  const filterSources = useMemo(
    () =>
      searchParams
        .get('source')
        ?.split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean) ?? [],
    [searchParams]
  );

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // ── Build stable fetch options for the infinite scroll hook ─────────
  const songsOpts = useMemo<FetchSongsOptions>(() => {
    const opts: FetchSongsOptions = {};
    if (search) {
      opts.search = search;
    }
    if (sort !== 'createdAt') {
      opts.sort = sort;
    }
    if (order !== 'desc') {
      opts.order = order;
    }
    const tagsParam = filterTags.join(',');
    const sourceParam = filterSources.join(',');
    if (tagsParam) {
      opts.tags = tagsParam;
    }
    if (sourceParam) {
      opts.source = sourceParam;
    }
    return opts;
  }, [search, sort, order, filterTags, filterSources]);

  // ── Lazy playlists fetch ────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const p = await getPlaylistsPage(isAdminView, 1, 100);
        setPlaylists(p.items);
      } catch {
        /* Silently ignore playlist fetch error */
      }
    })();
  }, [isAdminView]);

  // ── Comparator for re-sorting after real-time mutations ──────────────
  const songCompareFn = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    return (a: Song, b: Song): number => {
      switch (sort) {
        case 'title': {
          // Sort by display name: nickname if set, otherwise title
          const aName = (a.nickname || a.title) ?? '';
          const bName = (b.nickname || b.title) ?? '';
          return dir * aName.localeCompare(bName, undefined, { sensitivity: 'base' });
        }
        case 'artist': {
          const aArt = a.artist ?? '';
          const bArt = b.artist ?? '';
          // nulls last, regardless of direction
          if (!aArt && !bArt) {
            return 0;
          }
          if (!aArt) {
            return dir;
          }
          if (!bArt) {
            return -dir;
          }
          return dir * aArt.localeCompare(bArt, undefined, { sensitivity: 'base' });
        }
        case 'album': {
          const aAlb = a.album ?? '';
          const bAlb = b.album ?? '';
          if (!aAlb && !bAlb) {
            return 0;
          }
          if (!aAlb) {
            return dir;
          }
          if (!bAlb) {
            return -dir;
          }
          return dir * aAlb.localeCompare(bAlb, undefined, { sensitivity: 'base' });
        }
        case 'duration':
          return dir * ((a.duration ?? 0) - (b.duration ?? 0));
        case 'createdAt':
          // newest first for desc, oldest first for asc
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
    };
  }, [sort, order]);

  // ── Infinite scroll ─────────────────────────────────────────────────
  const {
    items,
    isLoading,
    isFetching,
    isError,
    hasMore,
    total,
    hasLoaded,
    prepend,
    updateItem,
    removeItem,
    fetchNextPage,
    retry,
  } = usePaginatedData<Song, [FetchSongsOptions]>({
    fetchPage: async (page, limit, opts) => {
      const result = await getSongsPage(page, limit, opts);
      return {
        items: result.items,
        hasMore: result.pagination.page < result.pagination.totalPages,
        total: result.pagination.total,
      };
    },
    limit: ITEMS_PER_PAGE,
    deps: [songsOpts],
    compareFn: songCompareFn,
  });

  // ── Real-time socket wiring ─────────────────────────────────────────
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

  // ── Bulk actions ─────────────────────────────────────────────────────
  const handleBulkDelete = useCallback(() => {
    setBulkDeleteConfirm(true);
  }, []);

  const executeBulkDelete = useCallback(async () => {
    if (bulk.count === 0) {
      return;
    }
    setBulkDeleteConfirm(false);
    setBulkDeleting(true);
    try {
      const allIds = [...bulk.selectedIds];
      const chunkSize = 500;
      for (let i = 0; i < allIds.length; i += chunkSize) {
        await bulkDeleteSongs(allIds.slice(i, i + chunkSize));
      }
      for (const id of allIds) {
        removeItem(id);
      }
      notify(`Deleted ${allIds.length} song${allIds.length !== 1 ? 's' : ''}`, 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Failed to delete songs.'), 'error', 5000);
    } finally {
      setBulkDeleting(false);
      bulk.clearAll();
      setSelectionMode(false);
    }
  }, [bulk, removeItem, notify]);

  const handleBulkEdit = useCallback(
    async (data: BulkEditData) => {
      if (bulk.count === 0) {
        return;
      }
      setBulkEditingApplying(true);
      try {
        const allIds = [...bulk.selectedIds];
        const chunkSize = 500;
        for (let i = 0; i < allIds.length; i += chunkSize) {
          await bulkEditSongs(allIds.slice(i, i + chunkSize), data);
        }
        notify(`Updated ${allIds.length} song${allIds.length !== 1 ? 's' : ''}`, 'success');
        setBulkEditingOpen(false);
      } catch (err: unknown) {
        notify(apiErrorMessage(err, 'Failed to update songs.'), 'error', 5000);
      } finally {
        setBulkEditingApplying(false);
        bulk.clearAll();
        setSelectionMode(false);
      }
    },
    [bulk, notify]
  );

  // ── Play from song ──────────────────────────────────────────────────
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
        notifyUnlessRateLimit(
          err,
          'Could not start playback. Is the bot in a voice channel?',
          notify
        );
      } finally {
        setPlayingId(null);
      }
    },
    [queueState.loopMode, notify]
  );

  return (
    <div className='p-4 md:p-8 flex flex-col min-h-0 h-full' style={{ paddingBottom: 0 }}>
      <PageHeader
        icon={MusicNotesIcon}
        title='Songs'
        subtitle={`Music library${hasLoaded ? ` • ${total} track${total !== 1 ? 's' : ''}` : ''}`}
      >
        <span className='relative group'>
          <QuestionIcon size={20} weight='duotone' className='text-muted cursor-help' />
          <span className='glass-tooltip absolute right-0 top-full mt-2 w-64 p-3 leading-relaxed'>
            Songs are added through the <span className='text-accent'>Requests</span> page. Submit a
            URL there — admins review and approve it, or it&rsquo;s added instantly if you have
            permission.
          </span>
        </span>
      </PageHeader>

      <ListToolbar
        searchValue={search}
        onSearchChange={(v) => updateParam('search', v || null)}
        searchPlaceholder='Search by title, nickname, artist, album, or tag...'
        sortOptions={SORT_OPTIONS}
        sort={sort}
        order={order as 'asc' | 'desc'}
        onSortChange={(field, newOrder) => {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (field === 'createdAt') {
                next.delete('sort');
              } else {
                next.set('sort', field);
              }
              if (newOrder === 'asc') {
                next.set('order', 'asc');
              } else {
                next.delete('order');
              }
              return next;
            },
            { replace: true }
          );
        }}
        defaultSort='createdAt'
        textSortFields={['title', 'artist', 'album']}
        filterTags={filterTags}
        filterSources={filterSources}
        onAddTag={(tag) => {
          const normalized = tag.toLowerCase();
          if (filterTags.includes(normalized)) {
            return;
          }
          updateParam('tags', [...filterTags, normalized].join(','));
        }}
        onRemoveTag={(tag) =>
          updateParam('tags', filterTags.filter((t) => t !== tag).join(',') || null)
        }
        onAddSource={(s) => {
          if (filterSources.includes(s)) {
            return;
          }
          updateParam('source', [...filterSources, s].join(','));
        }}
        onRemoveSource={(s) =>
          updateParam('source', filterSources.filter((x) => x !== s).join(',') || null)
        }
        showBulkToggle={canBulk}
        selectionMode={selectionMode}
        onToggleSelectionMode={() => {
          if (selectionMode) {
            bulk.clearAll();
          }
          setSelectionMode((v) => !v);
        }}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          localStorage.setItem('alfira-song-view', mode);
          setViewMode(mode);
        }}
      />

      {/* Content */}
      <AnimatePresence mode='wait'>
        {viewMode === 'list' ? (
          <m.div
            key='list'
            className='flex-1 min-h-0 flex flex-col'
            variants={pageVariants}
            initial='initial'
            animate='animate'
            exit='exit'
            transition={viewTransition}
          >
            <VirtualSongList
              items={items}
              isAdminView={isAdminView}
              playlists={playlists}
              isLoading={isLoading}
              isFetching={isFetching}
              isError={isError}
              hasMore={hasMore}
              hasLoaded={hasLoaded}
              playingId={playingId}
              onRetry={retry}
              onFetchMore={fetchNextPage}
              onDelete={selectionMode ? undefined : handleSetDeleteId}
              onPlay={handlePlayFromSong}
              onAddToQueue={handleAddToQueue}
              selectionMode={selectionMode}
              isSelected={bulk.isSelected}
              onToggleSelect={bulk.toggle}
              emptyTitle={
                search || filterTags.length > 0 || filterSources.length > 0
                  ? 'No Matches'
                  : 'No Songs Yet'
              }
              emptyMessage={
                search || filterTags.length > 0 || filterSources.length > 0
                  ? 'Try adjusting your search or filters'
                  : 'Submit a request to add songs'
              }
            />
          </m.div>
        ) : (
          <m.div
            key='grid'
            className='flex-1 min-h-0 flex flex-col'
            variants={pageVariants}
            initial='initial'
            animate='animate'
            exit='exit'
            transition={viewTransition}
          >
            <VirtualSongGrid
              items={items}
              isAdminView={isAdminView}
              playlists={playlists}
              isLoading={isLoading}
              isFetching={isFetching}
              isError={isError}
              hasMore={hasMore}
              hasLoaded={hasLoaded}
              playingId={playingId}
              onRetry={retry}
              onFetchMore={fetchNextPage}
              onDelete={selectionMode ? undefined : handleSetDeleteId}
              onPlay={handlePlayFromSong}
              onAddToQueue={handleAddToQueue}
              selectionMode={selectionMode}
              isSelected={bulk.isSelected}
              onToggleSelect={bulk.toggle}
              emptyTitle={
                search || filterTags.length > 0 || filterSources.length > 0
                  ? 'No Matches'
                  : 'No Songs Yet'
              }
              emptyMessage={
                search || filterTags.length > 0 || filterSources.length > 0
                  ? 'Try adjusting your search or filters'
                  : 'Submit a request to add songs'
              }
            />
          </m.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      {deleteId && (
        <DeleteConfirmDialog
          song={items.find((s) => s.id === deleteId)}
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {bulkDeleteConfirm && (
        <ConfirmModal
          title='Delete Songs'
          message={
            <>
              Permanently delete{' '}
              <span className='text-fg font-semibold'>
                {bulk.count} song{bulk.count !== 1 ? 's' : ''}
              </span>{' '}
              from the library? This cannot be undone.
            </>
          }
          confirmLabel='Delete'
          onConfirm={executeBulkDelete}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}

      {/* Notification Toast */}
      {notification && (
        <NotificationToast notification={notification} lift={selectionMode && bulk.count !== 0} />
      )}

      {/* Bulk action bar */}
      {selectionMode && bulk.count > 0 && (
        <BulkActionBar
          count={bulk.count}
          loadedCount={items.length}
          totalCount={total}
          canDelete={canDelete}
          canTag={canEdit}
          onDelete={handleBulkDelete}
          onTag={() => setBulkEditingOpen(true)}
          onSelectAll={() => bulk.selectAll(items.map((s) => s.id))}
          onDeselectAll={bulk.clearAll}
          isDeleting={bulkDeleting}
        />
      )}

      {/* Bulk edit modal */}
      {bulkEditingOpen && (
        <BulkEditModal
          count={bulk.count}
          onApply={handleBulkEdit}
          onClose={() => setBulkEditingOpen(false)}
          isApplying={bulkEditingApplying}
        />
      )}
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
  if (!song) {
    return null;
  }
  return (
    <ConfirmModal
      title='Delete Song'
      message={
        <>
          Remove <span className='text-fg font-semibold'>"{song.nickname || song.title}"</span> from
          the library?{' '}
          <span className='font-mono text-xs text-danger/70'>
            this will remove it from all playlists too.
          </span>
        </>
      }
      confirmLabel='Delete'
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
