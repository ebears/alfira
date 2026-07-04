import type { Playlist, PlaylistDetail, Song, TagItem } from '@alfira-bot/server/shared';
import type { FetchSongsOptions } from '@alfira-bot/server/shared/api';
import { fetchTags, updatePlaylistTag } from '@alfira-bot/server/shared/api';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BombIcon,
  CaretDownIcon,
  CaretLeftIcon,
  FunnelIcon,
  GhostIcon,
  ListIcon,
  LockIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  PencilSimple,
  PlayCircleIcon,
  PlayIcon,
  PlusCircleIcon,
  ShuffleIcon,
  SortAscendingIcon,
  SquaresFourIcon,
  TagIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  deletePlaylist,
  getPlaylistPage,
  removeSongFromPlaylist,
  renamePlaylist,
  startPlayback,
  togglePlaylistVisibility,
} from '../api/api';
import AddFilterPopover from '../components/AddFilterPopover';
import AddSongsModal from '../components/AddSongsModal';
import ConfirmModal from '../components/ConfirmModal';
import type { MenuItem } from '../components/ContextMenu';
import { ContextMenu, ContextMenuTrigger } from '../components/ContextMenu';
import EmptyState from '../components/EmptyState';
import FilterChips from '../components/FilterChips';
import NotificationToast from '../components/NotificationToast';

import { Button } from '../components/ui/Button';
import { VirtualSongList } from '../components/VirtualSongList';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import { usePlayerState } from '../context/PlayerContext';
import { useAddToQueue } from '../hooks/useAddToQueue';
import { useNotification } from '../hooks/useNotification';
import { onSocketEvent } from '../hooks/useSocket';
import { apiErrorMessage } from '../utils/api';

const ITEMS_PER_PAGE = 24;

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  orange: { bg: 'bg-orange-500/15', text: 'text-orange-300' },
  sky: { bg: 'bg-sky-500/15', text: 'text-sky-300' },
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  amber: { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  violet: { bg: 'bg-violet-500/15', text: 'text-violet-300' },
};

function hashTagColor(tag: string): { bg: string; text: string } {
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) hash = (hash * 33) ^ tag.charCodeAt(i);
  const colors = Object.values(TAG_COLORS);
  return colors[((hash >>> 0) * 31) % colors.length];
}

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [playlistDetail, setPlaylistDetail] = useState<PlaylistDetail | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [showAddSongs, setShowAddSongs] = useState(false);

  const [removeId, setRemoveId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [tagSmartConfirm, setTagSmartConfirm] = useState<string | null>(null);
  const [tags, setTags] = useState<TagItem[]>([]);
  const { handleAddToQueue, notification } = useAddToQueue();
  const { notify } = useNotification();

  const SORT_OPTIONS = [
    { value: 'position', label: 'Playlist Order' },
    { value: 'createdAt', label: 'Date Added' },
    { value: 'title', label: 'Title' },
    { value: 'artist', label: 'Artist' },
    { value: 'album', label: 'Album' },
    { value: 'duration', label: 'Duration' },
  ] as const;

  const isOwner = user?.discordId === playlistDetail?.createdBy;
  const canEdit = isAdminView || isOwner || hasPermission('songs.edit');
  const isSmart = !!playlistDetail?.tagNameLower;
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fetch tags for tag change submenu
  useEffect(() => {
    if (canEdit) {
      fetchTags()
        .then(setTags)
        .catch(() => {
          // Tags are non-critical — fail silently
        });
    }
  }, [canEdit]);

  const { state: queueState } = usePlayerState();

  // Refs for socket handlers
  const idRef = useRef(id);
  const isAdminViewRef = useRef(isAdminView);
  idRef.current = id;
  isAdminViewRef.current = isAdminView;

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('alfira-playlist-detail-view');
    return saved === 'grid' ? 'grid' : 'list';
  });
  const searchRef = useRef(search);

  // Sort & filter state
  const [sort, setSort] = useState('position');
  const [order, setOrder] = useState('desc');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterSources, setFilterSources] = useState<string[]>([]);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const sortRefEl = useRef<HTMLDivElement>(null);
  const sortRef = useRef(sort);
  const orderRef = useRef(order);
  const filterTagsRef = useRef(filterTags);
  const filterSourcesRef = useRef(filterSources);

  // Keep refs in sync
  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);
  useEffect(() => {
    filterTagsRef.current = filterTags;
  }, [filterTags]);
  useEffect(() => {
    filterSourcesRef.current = filterSources;
  }, [filterSources]);

  // Build stable fetch options for loadPage
  const songsOpts = useMemo<FetchSongsOptions>(() => {
    const opts: FetchSongsOptions = {};
    if (search) opts.search = search;
    if (sort !== 'position') opts.sort = sort;
    if (order !== 'desc') opts.order = order;
    const t = filterTags.join(',');
    const s = filterSources.join(',');
    if (t) opts.tags = t;
    if (s) opts.source = s;
    return opts;
  }, [search, sort, order, filterTags, filterSources]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRefEl.current && !sortRefEl.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  // Keep searchRef in sync with search state
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // Accumulated songs from all pages
  const [songs, setSongs] = useState<PlaylistDetail['songs']>([]);

  // IntersectionObserver ref for sentinel
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadPage = useCallback(
    async (page: number, isInitial = false, isRefetch = false, searchQuery?: string) => {
      if (!idRef.current) return;

      if (isInitial) {
        setIsLoading(true);
        setSongs([]);
      } else {
        setIsFetching(true);
      }
      setIsError(false);

      try {
        const opts: FetchSongsOptions = searchQuery
          ? {
              search: searchQuery,
              sort: sortRef.current,
              order: orderRef.current,
            }
          : {
              sort: sortRef.current,
              order: orderRef.current,
            };
        const tags = filterTagsRef.current.join(',');
        const sources = filterSourcesRef.current.join(',');
        if (tags) opts.tags = tags;
        if (sources) opts.source = sources;

        const pl = await getPlaylistPage(
          idRef.current,
          isAdminViewRef.current,
          page,
          ITEMS_PER_PAGE,
          opts
        );

        if (isInitial) {
          setPlaylistDetail(pl);
          setSongs(pl.songs);
          setRenameValue(pl.name);
        } else if (isRefetch) {
          // Socket-triggered refetch: replace songs so we don't accumulate duplicates.
          setSongs(pl.songs);
          setPlaylistDetail(pl);
        } else {
          // User scroll: accumulate songs from the new page.
          setSongs((prev) => [...prev, ...pl.songs]);
          // Keep latest playlist metadata
          setPlaylistDetail(pl);
        }
        setHasMore(pl.songs.length === ITEMS_PER_PAGE);
      } catch {
        setIsError(true);
      } finally {
        setIsLoading(false);
        setIsFetching(false);
      }
    },
    []
  );

  const handleOrderToggle = useCallback(() => {
    setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    setCurrentPage(1);
    setSongs([]);
    setIsError(false);
    void loadPage(1, false, false, searchRef.current);
  }, [loadPage]);

  const handleSortChange = useCallback(
    (newSort: string) => {
      if (newSort === sort) {
        handleOrderToggle();
      } else {
        setSort(newSort);
        setSortOpen(false);
        setCurrentPage(1);
        setSongs([]);
        setIsError(false);
        void loadPage(1, false, false, searchRef.current);
      }
    },
    [sort, loadPage, handleOrderToggle]
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      setFilterTags((prev) => prev.filter((t) => t !== tag));
      setCurrentPage(1);
      setSongs([]);
      setIsError(false);
      void loadPage(1, false, false, searchRef.current);
    },
    [loadPage]
  );

  const handleRemoveSource = useCallback(
    (source: string) => {
      setFilterSources((prev) => prev.filter((s) => s !== source));
      setCurrentPage(1);
      setSongs([]);
      setIsError(false);
      void loadPage(1, false, false, searchRef.current);
    },
    [loadPage]
  );

  const handleAddTag = useCallback(
    (tag: string) => {
      const normalized = tag.toLowerCase();
      setFilterTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
      setCurrentPage(1);
      setSongs([]);
      setIsError(false);
      void loadPage(1, false, false, searchRef.current);
    },
    [loadPage]
  );

  const handleAddSource = useCallback(
    (source: string) => {
      setFilterSources((prev) => (prev.includes(source) ? prev : [...prev, source]));
      setCurrentPage(1);
      setSongs([]);
      setIsError(false);
      void loadPage(1, false, false, searchRef.current);
    },
    [loadPage]
  );

  // Initial load
  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  // Socket: playlist updated (rename, visibility, song count changes)
  useEffect(() => {
    const handlePlaylistUpdated = (updated: Playlist) => {
      if (updated.id !== idRef.current) return;
      // Refetch current page to get updated playlist + songs
      void loadPage(currentPage, false, true);
    };

    const offUpdated = onSocketEvent('playlists:updated', handlePlaylistUpdated);

    return () => {
      offUpdated();
    };
  }, [currentPage, loadPage]);

  // Stable callback to update a single song in the list (mirrors useVirtualizedInfiniteScroll.updateItem)
  const updateSong = useCallback((song: Song) => {
    setSongs((prev) => prev.map((ps) => (ps.songId === song.id ? { ...ps, song } : ps)));
  }, []);

  // Socket: song edited — update in real-time
  useEffect(() => {
    const offSongUpdated = onSocketEvent('songs:updated', updateSong);
    return () => {
      offSongUpdated();
    };
  }, [updateSong]);

  const handleRenameSave = async () => {
    if (!playlistDetail || !renameValue.trim() || renameValue.trim() === playlistDetail.name) {
      setRenameValue('');
      return;
    }
    setRenameSaving(true);
    try {
      const updated = await renamePlaylist(playlistDetail.id, renameValue.trim());
      setPlaylistDetail((p) => (p ? { ...p, name: updated.name } : p));
    } finally {
      setRenameSaving(false);
      setRenameValue('');
    }
  };

  const handleRemoveSong = async (songId: string) => {
    if (!playlistDetail) return;

    const prevLength = songs.length;
    try {
      await removeSongFromPlaylist(playlistDetail.id, songId);
      setSongs((prev) => prev.filter((ps) => ps.songId !== songId));

      // Refill if we dropped below a page
      if (prevLength === ITEMS_PER_PAGE && hasMore && idRef.current) {
        getPlaylistPage(
          idRef.current,
          isAdminViewRef.current,
          currentPage + 1,
          ITEMS_PER_PAGE,
          songsOpts
        ).then((pl) => {
          setSongs((prev) => [...prev, ...pl.songs].slice(0, ITEMS_PER_PAGE * currentPage));
        });
      }
    } finally {
      setRemoveId(null);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!playlistDetail) return;
    await deletePlaylist(playlistDetail.id);
    navigate('/playlists');
  };

  const handleToggleVisibility = async () => {
    if (!playlistDetail) return;
    try {
      const updated = await togglePlaylistVisibility(
        playlistDetail.id,
        !playlistDetail.isPrivate,
        isAdminView
      );
      setPlaylistDetail((p) => (p ? { ...p, isPrivate: updated.isPrivate } : p));
      notify(updated.isPrivate ? 'Playlist set to private' : 'Playlist set to public', 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Could not toggle visibility.'), 'error', 5000);
    }
  };

  const handlePlayFromSong = useCallback(
    async (
      songId: string,
      mode: 'sequential' | 'random' = 'sequential',
      { throwErrors = false }: { throwErrors?: boolean } = {}
    ) => {
      if (!playlistDetail) return;
      setPlayingSongId(songId);
      try {
        await startPlayback({
          playlistId: playlistDetail.id,
          mode,
          loop: queueState.loopMode,
          startFromSongId: songId,
        });
      } catch (err: unknown) {
        if (throwErrors) {
          throw err;
        }
        notify(apiErrorMessage(err, 'Could not start playback.'), 'error', 5000);
      } finally {
        setPlayingSongId(null);
      }
    },
    [playlistDetail, queueState.loopMode, notify]
  );

  const handleConvertToRegular = useCallback(async () => {
    if (!playlistDetail) return;
    try {
      await updatePlaylistTag(playlistDetail.id, null);
      setPlaylistDetail((p) => (p ? { ...p, tagNameLower: null } : p));
      void loadPage(currentPage, false, true);
      notify('Playlist converted to regular playlist', 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Could not convert playlist.'), 'error', 5000);
    }
  }, [playlistDetail, currentPage, loadPage, notify]);

  const handleChangeTag = useCallback(
    async (tagNameLower: string) => {
      if (!playlistDetail) return;
      try {
        const updated = await updatePlaylistTag(playlistDetail.id, tagNameLower);
        setPlaylistDetail((p) => (p ? { ...p, tagNameLower: updated.tagNameLower ?? null } : p));
        void loadPage(currentPage, false, true);
        notify('Playlist tag updated', 'success');
      } catch (err: unknown) {
        notify(apiErrorMessage(err, 'Could not update playlist tag.'), 'error', 5000);
      }
    },
    [playlistDetail, currentPage, loadPage, notify]
  );

  const handleMakeSmart = useCallback(
    async (tagNameLower: string) => {
      if (!playlistDetail) return;
      setTagSmartConfirm(null);
      try {
        const updated = await updatePlaylistTag(playlistDetail.id, tagNameLower);
        setPlaylistDetail((p) => (p ? { ...p, tagNameLower: updated.tagNameLower ?? null } : p));
        void loadPage(currentPage, false, true);
        notify('Playlist now tracking tag', 'success');
      } catch (err: unknown) {
        notify(apiErrorMessage(err, 'Could not update playlist tag.'), 'error', 5000);
      }
    },
    [playlistDetail, currentPage, loadPage, notify]
  );

  const handleAddPlaylistToQueue = useCallback(async () => {
    if (!playlistDetail) return;
    try {
      await startPlayback({
        playlistId: playlistDetail.id,
        mode: 'sequential',
        loop: queueState.loopMode,
      });
      notify(`Added "${playlistDetail.name}" to queue`, 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Could not add to queue.'), 'error', 5000);
    }
  }, [playlistDetail, queueState.loopMode, notify]);

  const tagSubmenuItems = tags.map((tag) => ({
    id: tag.nameLower,
    label: tag.canonicalName,
  }));

  const menuItems: MenuItem[] = [
    {
      id: 'add-to-queue',
      label: 'Add to Queue',
      icon: <PlusCircleIcon size={14} weight="duotone" />,
      disabled: songs.length === 0,
      onClick: handleAddPlaylistToQueue,
    },
    ...(isOwner || isAdminView
      ? [
          {
            id: 'rename',
            label: 'Rename',
            icon: <PencilSimple size={14} weight="duotone" />,
            editSubmenu: {
              title: 'Rename',
              value: renameValue,
              onChange: (val: string) => setRenameValue(val),
              onSave: handleRenameSave,
              onCancel: () => setRenameValue(''),
              saving: renameSaving,
              placeholder: 'Playlist name',
            },
          } as MenuItem,
          {
            id: 'toggle-visibility',
            label: playlistDetail?.isPrivate ? 'Make Public' : 'Make Private',
            icon: playlistDetail?.isPrivate ? (
              <LockOpenIcon size={14} weight="duotone" />
            ) : (
              <LockIcon size={14} weight="duotone" />
            ),
            onClick: handleToggleVisibility,
          } as MenuItem,
          ...(isSmart
            ? [
                {
                  id: 'change-tag',
                  label: 'Change Tracked Tag',
                  icon: <TagIcon size={14} weight="duotone" />,
                  submenu: {
                    title: 'Track Tag',
                    items: tagSubmenuItems,
                    onSelect: (tagId: string) => handleChangeTag(tagId),
                    emptyMessage: 'No tags available',
                  },
                } as MenuItem,
                {
                  id: 'convert-regular',
                  label: 'Convert to Regular Playlist',
                  icon: <PlayCircleIcon size={14} weight="duotone" />,
                  onClick: handleConvertToRegular,
                } as MenuItem,
              ]
            : [
                {
                  id: 'add-songs',
                  label: 'Add Songs',
                  icon: <PlayCircleIcon size={14} weight="duotone" />,
                  onClick: () => setShowAddSongs(true),
                } as MenuItem,
                {
                  id: 'make-smart',
                  label: 'Track a Tag',
                  icon: <TagIcon size={14} weight="duotone" />,
                  submenu: {
                    title: 'Track Tag',
                    items: tagSubmenuItems,
                    onSelect: (tagId: string) => setTagSmartConfirm(tagId),
                    emptyMessage: 'No tags available',
                  },
                } as MenuItem,
              ]),
          {
            id: 'delete',
            label: 'Delete',
            icon: <BombIcon size={14} weight="duotone" />,
            danger: true,
            onClick: () => setDeleteConfirm(true),
          } as MenuItem,
        ]
      : []),
  ];

  const loadMore = useCallback(() => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    void loadPage(nextPage, false, false, searchRef.current);
  }, [currentPage, loadPage]);

  const retry = useCallback(() => {
    void loadPage(currentPage, false, false, searchRef.current);
  }, [currentPage, loadPage]);

  // IntersectionObserver for infinite scroll
  const sentinelRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!el) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !isFetching && hasMore) {
            loadMore();
          }
        },
        { rootMargin: '300px' }
      );

      observerRef.current.observe(el);
    },
    [isFetching, hasMore, loadMore]
  );

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  if (isLoading) return <DetailSkeleton />;
  if (!playlistDetail) return null;

  // Extract plain songs from PlaylistDetailSong[]
  const songItems: Song[] = songs.map((ps) => ps.song);

  return (
    <div className="p-4 md:p-8">
      {/* Back */}
      <Button
        variant="inherit"
        surface="surface"
        onClick={() => navigate('/playlists')}
        className="flex items-center gap-1.5 font-mono text-xs mb-4 md:mb-6 min-h-11 md:min-h-0"
      >
        <CaretLeftIcon size={16} weight="duotone" className="md:w-3.5 md:h-3.5" />
        playlists
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 md:mb-8 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">
              {playlistDetail.name}
            </h1>
            {playlistDetail.isPrivate && (
              <span className="text-muted text-sm" title="Private playlist">
                <GhostIcon size={14} weight="duotone" className="inline mr-1" />
                private
              </span>
            )}
            {playlistDetail.tagNameLower &&
              (() => {
                const tag = tags.find((t) => t.nameLower === playlistDetail.tagNameLower);
                const displayName = tag?.canonicalName ?? playlistDetail.tagNameLower;
                const colors = hashTagColor(displayName);
                return (
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
                    title={`Auto-tracking all songs tagged "${displayName}"`}
                  >
                    <TagIcon size={12} weight="duotone" />
                    {displayName}
                  </span>
                );
              })()}
          </div>
          <p className="font-mono text-xs text-muted mt-2">
            {songItems.length} {songItems.length === 1 ? 'track' : 'tracks'}
            {playlistDetail.tagNameLower ? (
              <span className="text-accent"> • auto-tracked</span>
            ) : (
              <>
                {' • '}
                {isOwner
                  ? 'Created by you'
                  : `Created by ${playlistDetail.createdByDisplayName || playlistDetail.createdBy}`}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-2 shrink-0 items-center">
          <Button
            variant="secondary"
            className="!rounded-full"
            onClick={() => {
              void handlePlayFromSong(songs[0]?.songId, 'random');
            }}
            disabled={songItems.length === 0}
            title="Shuffle"
          >
            <ShuffleIcon size={18} weight="duotone" />
          </Button>
          <Button
            variant="primary"
            className="text-xs flex items-center gap-1.5"
            onClick={() => {
              void handlePlayFromSong(songs[0]?.songId, 'sequential');
            }}
            disabled={songItems.length === 0}
          >
            <PlayIcon size={14} weight="duotone" /> Play
          </Button>
          <ContextMenuTrigger
            ref={menuTriggerRef}
            onToggle={() => setMenuOpen((v) => !v)}
            isOpen={menuOpen}
            surface="surface"
            size="default"
            className="!rounded-full"
          />
          {menuOpen && (
            <ContextMenu
              items={menuItems}
              isOpen={menuOpen}
              onClose={() => setMenuOpen(false)}
              triggerRef={menuTriggerRef}
            />
          )}
        </div>
      </div>

      {/* Search, sort, filter, and view toggle */}
      <div className="flex items-center gap-2 mb-3">
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
              const value = e.target.value;
              setSearch(value);
              setCurrentPage(1);
              setSongs([]);
              setIsFetching(true);
              setIsError(false);
              void loadPage(1, false, false, value);
            }}
          />
        </div>

        {/* Filter button */}
        <button
          type="button"
          onClick={() => setFilterPopoverOpen(true)}
          className={`px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
            filterTags.length > 0 || filterSources.length > 0
              ? 'bg-accent text-elevated'
              : 'text-muted hover:text-fg'
          }`}
          title="Add filter"
        >
          <FunnelIcon size={16} weight="duotone" />
        </button>

        {/* Sort dropdown */}
        <div className="relative" ref={sortRefEl}>
          <Button
            variant="inherit"
            surface="surface"
            onClick={() => setSortOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 ${
              sortOpen || sort !== 'position' || order !== 'desc' ? 'pressed text-accent' : ''
            }`}
            title={`Sort by ${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Playlist Order'} (${order === 'asc' ? 'ascending' : 'descending'})`}
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
                        {order === 'asc' ? (
                          <ArrowUpIcon size={14} weight="bold" />
                        ) : (
                          <ArrowDownIcon size={14} weight="bold" />
                        )}
                      </button>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-elevated rounded-lg p-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setViewMode('list');
              localStorage.setItem('alfira-playlist-detail-view', 'list');
            }}
            className={`px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'list' ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
            }`}
            title="List view"
          >
            <ListIcon size={18} weight="duotone" />
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('grid');
              localStorage.setItem('alfira-playlist-detail-view', 'grid');
            }}
            className={`px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'grid' ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
            }`}
            title="Grid view"
          >
            <SquaresFourIcon size={18} weight="duotone" />
          </button>
        </div>
      </div>

      {/* Active filter chips */}
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

      {/* Song list */}
      {songItems.length === 0 && !isLoading ? (
        isSmart ? (
          <div className="text-center py-24">
            <p className="font-display text-4xl text-faint tracking-wider mb-2">No Songs Yet</p>
            <p className="font-mono text-xs text-faint">
              This playlist tracks the "
              {tags.find((t) => t.nameLower === playlistDetail.tagNameLower)?.canonicalName ??
                playlistDetail.tagNameLower}
              " tag. Tag some songs to populate it.
            </p>
          </div>
        ) : (
          <EmptyState
            title="Empty Playlist"
            isAdmin={canEdit}
            onAdd={() => setShowAddSongs(true)}
            addLabel="add some songs"
          />
        )
      ) : (
        <VirtualSongList
          items={songItems}
          viewMode={viewMode}
          isAdminView={isAdminView}
          playlists={[]}
          isLoading={isLoading}
          isFetching={isFetching}
          isError={isError}
          hasMore={hasMore}
          playingId={playingSongId}
          onRetry={retry}
          sentinelRef={sentinelRef}
          onDelete={(id) => {
            const ps = songs.find((p) => p.songId === id);
            if (ps) setRemoveId(ps.songId);
          }}
          onPlay={handlePlayFromSong}
          onAddToQueue={handleAddToQueue}
        />
      )}

      {/* Modals */}
      {showAddSongs && (
        <AddSongsModal
          playlist={playlistDetail}
          onClose={() => setShowAddSongs(false)}
          onAdded={() => {
            void loadPage(currentPage, false);
            setShowAddSongs(false);
          }}
        />
      )}
      {/* Notification Toast */}
      {notification && <NotificationToast notification={notification} />}
      {removeId && (
        <ConfirmModal
          title="Remove Song"
          message={
            <>
              Remove{' '}
              <span className="text-fg font-semibold">
                "{songs.find((ps) => ps.songId === removeId)?.song?.title}"
              </span>{' '}
              from this playlist? The song won't be deleted from the library.
            </>
          }
          confirmLabel="Remove"
          onConfirm={() => handleRemoveSong(removeId)}
          onCancel={() => setRemoveId(null)}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Playlist"
          message="This playlist will be permanently deleted. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            setDeleteConfirm(false);
            handleDeletePlaylist();
          }}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
      {tagSmartConfirm && (
        <ConfirmModal
          title="Track a Tag"
          message={
            <>
              This will convert the playlist to auto-track the "
              <span className="text-fg font-semibold">
                {tags.find((t) => t.nameLower === tagSmartConfirm)?.canonicalName ??
                  tagSmartConfirm}
              </span>
              " tag. All current songs not matching this tag will be removed.
            </>
          }
          confirmLabel="Convert"
          onConfirm={() => handleMakeSmart(tagSmartConfirm)}
          onCancel={() => setTagSmartConfirm(null)}
        />
      )}

      {/* Add Filter popover */}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton / empty state
// ---------------------------------------------------------------------------
function DetailSkeleton() {
  return (
    <div className="p-8">
      <div className="skeleton h-3 w-20 mb-6 rounded" />
      <div className="skeleton h-12 w-64 mb-2 rounded" />
      <div className="skeleton h-3 w-24 mb-8 rounded" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={`skeleton-${i}`} className="flex items-center gap-4 py-3">
          <div className="skeleton w-6 h-3 rounded" />
          <div className="skeleton w-10 h-7 rounded" />
          <div className="skeleton h-3 flex-1 rounded" />
          <div className="skeleton h-3 w-12 rounded" />
        </div>
      ))}
    </div>
  );
}
