import type { Playlist, Song } from '@alfira-bot/server/shared';
import type { FetchSongsOptions } from '@alfira-bot/server/shared/api';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CheckSquareIcon,
  FunnelIcon,
  ListIcon,
  MagnifyingGlassIcon,
  QuestionIcon,
  SortAscendingIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  bulkDeleteSongs,
  bulkEditSongs,
  deleteSong,
  getPlaylistsPage,
  getSongsPage,
  startPlayback,
} from '../api/api';
import AddFilterPopover from '../components/AddFilterPopover';
import BulkActionBar from '../components/BulkActionBar';
import BulkEditModal from '../components/BulkEditModal';
import ConfirmModal from '../components/ConfirmModal';
import FilterChips from '../components/FilterChips';
import NotificationToast from '../components/NotificationToast';
import { Button } from '../components/ui/Button';
import { VirtualSongList } from '../components/VirtualSongList';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';
import { usePlayerState } from '../context/PlayerContext';
import { useAddToQueue } from '../hooks/useAddToQueue';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { useNotification } from '../hooks/useNotification';
import { onSocketEvent } from '../hooks/useSocket';
import { useVirtualizedInfiniteScroll } from '../hooks/useVirtualizedInfiniteScroll';
import { apiErrorMessage } from '../utils/api';

const ITEMS_PER_PAGE = 24;

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('alfira-library-view');
    return saved === 'grid' ? 'grid' : 'list';
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { handleAddToQueue, notification } = useAddToQueue();
  const { notify } = useNotification();
  const handleSetDeleteId = useCallback((id: string | null) => setDeleteId(id), []);

  // Sort dropdown state
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Add filter popover state
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  // Bulk selection
  const bulk = useBulkSelection();
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

  // Local search input mirrors URL param
  const [searchInput, setSearchInput] = useState(search);

  // Sync search input ← URL (e.g. on browser back/forward)
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

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

  // Debounced search → URL
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        updateParam('search', value || null);
      }, 250);
    },
    [updateParam]
  );

  // ── Sort handlers ───────────────────────────────────────────────────
  const handleOrderToggle = useCallback(() => {
    updateParam('order', order === 'asc' ? null : 'asc');
  }, [order, updateParam]);

  const handleSortChange = useCallback(
    (newSort: SortField) => {
      if (newSort === sort) {
        handleOrderToggle();
      } else {
        // When switching to a text field, default to ascending (A-Z).
        // Update both params atomically — React Router's setSearchParams
        // sees the same URL for each callback, so two calls would race.
        const newOrder = newSort === 'createdAt' || newSort === 'duration' ? 'desc' : 'asc';
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (newSort === 'createdAt') {
              next.delete('sort');
            } else {
              next.set('sort', newSort);
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
      }
      setSortOpen(false);
    },
    [sort, setSearchParams, handleOrderToggle]
  );

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  // ── Filter handlers ─────────────────────────────────────────────────
  const handleRemoveTag = useCallback(
    (tag: string) => {
      const next = filterTags.filter((t) => t !== tag);
      updateParam('tags', next.length > 0 ? next.join(',') : null);
    },
    [filterTags, updateParam]
  );

  const handleRemoveSource = useCallback(
    (source: string) => {
      const next = filterSources.filter((s) => s !== source);
      updateParam('source', next.length > 0 ? next.join(',') : null);
    },
    [filterSources, updateParam]
  );

  const handleAddTag = useCallback(
    (tag: string) => {
      // Normalize to lowercase for consistency
      const normalized = tag.toLowerCase();
      if (filterTags.includes(normalized)) return;
      const next = [...filterTags, normalized];
      updateParam('tags', next.join(','));
    },
    [filterTags, updateParam]
  );

  const handleAddSource = useCallback(
    (source: string) => {
      if (filterSources.includes(source)) return;
      const next = [...filterSources, source];
      updateParam('source', next.join(','));
    },
    [filterSources, updateParam]
  );

  // ── Build stable fetch options for the infinite scroll hook ─────────
  const songsOpts = useMemo<FetchSongsOptions>(() => {
    const opts: FetchSongsOptions = {};
    if (search) opts.search = search;
    if (sort !== 'createdAt') opts.sort = sort;
    if (order !== 'desc') opts.order = order;
    const tagsParam = filterTags.join(',');
    const sourceParam = filterSources.join(',');
    if (tagsParam) opts.tags = tagsParam;
    if (sourceParam) opts.source = sourceParam;
    return opts;
  }, [search, sort, order, filterTags, filterSources]);

  // ── Lazy playlists fetch ────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  useEffect(() => {
    void getPlaylistsPage(isAdminView, 1, 100)
      .then((p) => setPlaylists(p.items))
      .catch(() => {
        /* Silently ignore playlist fetch error */
      });
  }, [isAdminView]);

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
    retry,
    sentinelRef,
  } = useVirtualizedInfiniteScroll<Song, [FetchSongsOptions]>({
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
    if (bulk.count === 0) return;
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
    async (data: import('@alfira-bot/server/shared/api').BulkEditData) => {
      if (bulk.count === 0) return;
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
          <p className="font-mono text-xs text-muted mt-2">
            Music library{hasLoaded ? ` • ${total} track${total !== 1 ? 's' : ''}` : ''}
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

      {/* Search bar + Sort + View toggle */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint w-4 h-4 md:w-3.5 md:h-3.5"
            weight="duotone"
          />
          <input
            className="input pl-10"
            placeholder="Search by title, nickname, artist, album, or tag..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Select toggle (only visible to users with bulk permissions) */}
        {canBulk && (
          <Button
            variant="inherit"
            surface="surface"
            onClick={() => {
              if (selectionMode) bulk.clearAll();
              setSelectionMode((v) => !v);
            }}
            className={`flex items-center gap-1.5 px-2.5 ${
              selectionMode ? 'pressed text-accent' : ''
            }`}
            title={selectionMode ? 'Exit selection mode' : 'Select songs'}
          >
            <CheckSquareIcon size={16} weight="duotone" />
          </Button>
        )}

        {/* Add filter button */}
        <Button
          variant="inherit"
          surface="surface"
          onClick={() => setFilterPopoverOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 ${
            filterTags.length > 0 || filterSources.length > 0 ? 'pressed text-accent' : ''
          }`}
          title={`Filter${filterTags.length > 0 || filterSources.length > 0 ? ` (${filterTags.length + filterSources.length} active)` : ''}`}
        >
          <FunnelIcon size={16} weight="duotone" />
        </Button>

        {/* Sort dropdown */}
        <div className="relative" ref={sortRef}>
          <Button
            variant="inherit"
            surface="surface"
            onClick={() => setSortOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 ${
              sortOpen || sort !== 'createdAt' || order !== 'desc' ? 'pressed text-accent' : ''
            }`}
            title={`Sort by ${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Date Added'} (${order === 'asc' ? 'ascending' : 'descending'})`}
          >
            <SortAscendingIcon size={16} weight="duotone" />
            <CaretDownIcon size={10} weight="fill" className="text-faint" />
          </Button>

          {sortOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-elevated border border-border rounded-lg shadow-lg z-20 py-1 animate-fade-up origin-top-right">
              {SORT_OPTIONS.map((opt) => {
                const isActive = sort === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm font-body transition-colors ${
                      isActive
                        ? 'text-accent bg-accent/5'
                        : 'text-fg hover:bg-surface active:bg-surface/80'
                    }`}
                    onClick={() => handleSortChange(opt.value)}
                  >
                    <span>{opt.label}</span>
                    {isActive && (
                      <button
                        type="button"
                        className="cursor-pointer p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOrderToggle();
                        }}
                        title={order === 'asc' ? 'Switch to descending' : 'Switch to ascending'}
                      >
                        {(() => {
                          const isTextField =
                            sort === 'title' || sort === 'artist' || sort === 'album';
                          const showDown = isTextField ? order === 'asc' : order !== 'asc';
                          return showDown ? (
                            <ArrowDownIcon size={14} weight="bold" />
                          ) : (
                            <ArrowUpIcon size={14} weight="bold" />
                          );
                        })()}
                      </button>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-elevated rounded-lg p-1">
          <button
            type="button"
            onClick={() => {
              setViewMode('list');
              localStorage.setItem('alfira-library-view', 'list');
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-body transition-colors cursor-pointer ${
              !isGrid ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
            }`}
            title="List view"
          >
            <ListIcon size={18} weight="duotone" />
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('grid');
              localStorage.setItem('alfira-library-view', 'grid');
            }}
            className={`px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
              isGrid ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
            }`}
            title="Grid view"
          >
            <SquaresFourIcon size={18} weight="duotone" />
          </button>
        </div>
      </div>

      {/* Active filter chips — only shown when filters are active */}
      {(filterTags.length > 0 || filterSources.length > 0) && (
        <div className="mb-2">
          <FilterChips
            tags={filterTags}
            sources={filterSources}
            onRemoveTag={handleRemoveTag}
            onRemoveSource={handleRemoveSource}
          />
        </div>
      )}

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
        hasLoaded={hasLoaded}
        playingId={playingId}
        onRetry={retry}
        sentinelRef={sentinelRef}
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

      {/* ── Add Filter popover ────────────────────────────────── */}
      {filterPopoverOpen && (
        <AddFilterPopover
          activeTags={filterTags}
          activeSources={filterSources}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          onAddSource={handleAddSource}
          onRemoveSource={handleRemoveSource}
          onClose={() => setFilterPopoverOpen(false)}
        />
      )}

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
          title="Delete Songs"
          message={
            <>
              Permanently delete{' '}
              <span className="text-fg font-semibold">
                {bulk.count} song{bulk.count !== 1 ? 's' : ''}
              </span>{' '}
              from the library? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
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
