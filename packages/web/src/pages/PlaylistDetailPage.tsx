import type { Playlist, PlaylistDetail, Song, TagItem } from '@alfira-bot/server/shared';
import type { FetchSongsOptions } from '@alfira-bot/server/shared/api';
import { fetchTags, updatePlaylistTag } from '@alfira-bot/server/shared/api';
import { useVirtualizedInfiniteScroll } from '../hooks/useVirtualizedInfiniteScroll';

type PlaylistDetailMeta = Omit<PlaylistDetail, 'songs'>;

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BombIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CheckSquareIcon,
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
  bulkEditSongs,
  bulkRemoveSongsFromPlaylist,
  deletePlaylist,
  getPlaylistPage,
  removeSongFromPlaylist,
  renamePlaylist,
  startPlayback,
  togglePlaylistVisibility,
} from '../api/api';
import AddFilterPopover from '../components/AddFilterPopover';
import AddSongsModal from '../components/AddSongsModal';
import BulkActionBar from '../components/BulkActionBar';
import BulkEditModal from '../components/BulkEditModal';
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
import { useBulkSelection } from '../hooks/useBulkSelection';
import { useNotification } from '../hooks/useNotification';
import { onSocketEvent } from '../hooks/useSocket';
import { apiErrorMessage } from '../utils/api';
import { getTagColorClasses } from '../utils/tagColors';

const ITEMS_PER_PAGE = 24;

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const navigate = useNavigate();

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

  // Bulk selection
  const bulk = useBulkSelection();
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);
  const [bulkEditingOpen, setBulkEditingOpen] = useState(false);
  const [bulkEditingApplying, setBulkEditingApplying] = useState(false);

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fetch tags for tag change submenu
  useEffect(() => {
    if (isAdminView || user?.discordId) {
      fetchTags()
        .then(setTags)
        .catch(() => {
          // Tags are non-critical — fail silently
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminView, user?.discordId]);

  const { state: queueState } = usePlayerState();

  const idRef = useRef(id);
  const isAdminViewRef = useRef(isAdminView);
  idRef.current = id;
  isAdminViewRef.current = isAdminView;

  // Search & filter state
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('alfira-playlist-detail-view');
    return saved === 'grid' ? 'grid' : 'list';
  });

  // Sort & filter state
  const [sort, setSort] = useState('position');
  const [order, setOrder] = useState('desc');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterSources, setFilterSources] = useState<string[]>([]);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const sortRefEl = useRef<HTMLDivElement>(null);

  // Build stable fetch options for the hook
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

  // ── Infinite scroll with metadata ────────────────────────────────────

  const {
    items: songs,
    metadata: playlistMeta,
    isLoading,
    isFetching,
    isError,
    hasMore,
    total: totalSongs,
    hasLoaded,
    updateItem,
    removeItem,
    retry,
    sentinelRef,
    refetch,
  } = useVirtualizedInfiniteScroll<
    PlaylistDetail['songs'][number],
    [string, boolean, FetchSongsOptions],
    PlaylistDetailMeta
  >({
    fetchPage: async (page, limit, playlistId, adminView, opts) => {
      const pl = await getPlaylistPage(playlistId, adminView, page, limit, opts);
      return {
        items: pl.songs,
        hasMore: pl.songs.length === limit,
        total: pl.pagination.total,
        metadata: {
          id: pl.id,
          name: pl.name,
          createdBy: pl.createdBy,
          createdByDisplayName: pl.createdByDisplayName,
          isPrivate: pl.isPrivate,
          tagNameLower: pl.tagNameLower,
          createdAt: pl.createdAt,
        } as PlaylistDetailMeta,
      };
    },
    limit: ITEMS_PER_PAGE,
    deps: [id!, isAdminView, songsOpts],
  });

  // Derive PlaylistDetail for JSX — metadata from the hook, songs from items
  const playlistDetail = playlistMeta
    ? ({
        ...playlistMeta,
        songs,
      } as PlaylistDetail)
    : null;

  const isOwner = user?.discordId === playlistDetail?.createdBy;
  const canEdit = isAdminView || isOwner || hasPermission('songs.edit');
  const canBulk = canEdit;
  const isSmart = !!playlistDetail?.tagNameLower;

  // ── Sort / filter handlers ──────────────────────────────────────────

  const handleOrderToggle = useCallback(() => {
    setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  const handleSortChange = useCallback(
    (newSort: string) => {
      if (newSort === sort) {
        handleOrderToggle();
      } else {
        const newOrder =
          newSort === 'createdAt' || newSort === 'position' || newSort === 'duration'
            ? 'desc'
            : 'asc';
        setSort(newSort);
        setOrder(newOrder);
        setSortOpen(false);
      }
    },
    [sort, handleOrderToggle]
  );

  const handleRemoveTag = useCallback((tag: string) => {
    setFilterTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleRemoveSource = useCallback((source: string) => {
    setFilterSources((prev) => prev.filter((s) => s !== source));
  }, []);

  const handleAddTag = useCallback((tag: string) => {
    const normalized = tag.toLowerCase();
    setFilterTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
  }, []);

  const handleAddSource = useCallback((source: string) => {
    setFilterSources((prev) => (prev.includes(source) ? prev : [...prev, source]));
  }, []);

  // ── Socket: playlist updated (rename, visibility, song count changes) ──
  useEffect(() => {
    const handlePlaylistUpdated = (updated: Playlist) => {
      if (updated.id !== idRef.current) return;
      refetch();
    };
    const offUpdated = onSocketEvent('playlists:updated', handlePlaylistUpdated);
    return () => {
      offUpdated();
    };
  }, [refetch]);

  // ── Socket: song edited — update in real-time ────────────────────────
  const songsRef = useRef(songs);
  songsRef.current = songs;

  useEffect(() => {
    const handleSongUpdated = (song: Song) => {
      const match = songsRef.current.find((ps) => ps.songId === song.id);
      if (match) {
        updateItem({ ...match, song });
      }
    };
    const offSongUpdated = onSocketEvent('songs:updated', handleSongUpdated);
    return () => {
      offSongUpdated();
    };
  }, [updateItem]);

  // Set initial rename value when metadata loads
  useEffect(() => {
    if (playlistMeta?.name) {
      setRenameValue(playlistMeta.name);
    }
  }, [playlistMeta?.name]);

  const handleRenameSave = async () => {
    if (!playlistDetail || !renameValue.trim() || renameValue.trim() === playlistDetail.name) {
      setRenameValue('');
      return;
    }
    setRenameSaving(true);
    try {
      await renamePlaylist(playlistDetail.id, renameValue.trim());
      refetch();
    } finally {
      setRenameSaving(false);
      setRenameValue('');
    }
  };

  const handleRemoveSong = async (songId: string) => {
    if (!playlistDetail) return;
    const junction = songsRef.current.find((ps) => ps.songId === songId);
    if (!junction) {
      setRemoveId(null);
      return;
    }
    try {
      await removeSongFromPlaylist(playlistDetail.id, songId);
      removeItem(junction.id);
    } finally {
      setRemoveId(null);
    }
  };

  // ── Bulk actions ─────────────────────────────────────────────────────
  const handleBulkRemove = useCallback(() => {
    setBulkRemoveConfirm(true);
  }, []);

  const executeBulkRemove = useCallback(async () => {
    if (!playlistDetail || bulk.count === 0) return;
    setBulkRemoveConfirm(false);
    setBulkRemoving(true);
    try {
      const allIds = [...bulk.selectedIds];
      // Map song IDs to junction IDs before the API call
      const junctionIds = allIds
        .map((songId) => songsRef.current.find((ps) => ps.songId === songId)?.id)
        .filter((id): id is string => id !== undefined);
      const chunkSize = 500;
      for (let i = 0; i < allIds.length; i += chunkSize) {
        await bulkRemoveSongsFromPlaylist(playlistDetail.id, allIds.slice(i, i + chunkSize));
      }
      for (const junctionId of junctionIds) {
        removeItem(junctionId);
      }
      notify(`Removed ${allIds.length} song${allIds.length !== 1 ? 's' : ''}`, 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Failed to remove songs.'), 'error', 5000);
    } finally {
      setBulkRemoving(false);
      bulk.clearAll();
      setSelectionMode(false);
    }
  }, [playlistDetail, bulk, notify, removeItem]);

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
      refetch();
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
      refetch();
      notify('Playlist converted to regular playlist', 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Could not convert playlist.'), 'error', 5000);
    }
  }, [playlistDetail, refetch, notify]);

  const handleChangeTag = useCallback(
    async (tagNameLower: string) => {
      if (!playlistDetail) return;
      try {
        await updatePlaylistTag(playlistDetail.id, tagNameLower);
        refetch();
        notify('Playlist tag updated', 'success');
      } catch (err: unknown) {
        notify(apiErrorMessage(err, 'Could not update playlist tag.'), 'error', 5000);
      }
    },
    [playlistDetail, refetch, notify]
  );

  const handleMakeSmart = useCallback(
    async (tagNameLower: string) => {
      if (!playlistDetail) return;
      setTagSmartConfirm(null);
      try {
        await updatePlaylistTag(playlistDetail.id, tagNameLower);
        refetch();
        notify('Playlist now tracking tag', 'success');
      } catch (err: unknown) {
        notify(apiErrorMessage(err, 'Could not update playlist tag.'), 'error', 5000);
      }
    },
    [playlistDetail, refetch, notify]
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

  if (isLoading || !hasLoaded) return <DetailSkeleton />;
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
                const colors = getTagColorClasses(displayName, tag?.color);
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
            className="rounded-full!"
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
            className="rounded-full!"
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
              setSearch(e.target.value);
            }}
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
            <div className="absolute right-0 top-full mt-1.5 w-48 glass-popover z-20 py-1 origin-top-right">
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
          <EmptyState
            title="No Songs Yet"
            message={`This playlist tracks the "${tags.find((t) => t.nameLower === playlistDetail.tagNameLower)?.canonicalName ?? playlistDetail.tagNameLower}" tag. Tag some songs to populate it.`}
          />
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
          hasLoaded={!isLoading}
          playingId={playingSongId}
          onRetry={retry}
          sentinelRef={sentinelRef}
          onDelete={
            selectionMode
              ? undefined
              : (id) => {
                  const ps = songs.find((p) => p.songId === id);
                  if (ps) setRemoveId(ps.songId);
                }
          }
          onPlay={handlePlayFromSong}
          onAddToQueue={handleAddToQueue}
          selectionMode={selectionMode}
          isSelected={bulk.isSelected}
          onToggleSelect={bulk.toggle}
          emptyTitle="No Songs"
          emptyMessage="Add songs to this playlist"
        />
      )}

      {/* Modals */}
      {showAddSongs && (
        <AddSongsModal
          playlist={playlistDetail}
          onClose={() => setShowAddSongs(false)}
          onAdded={() => {
            refetch();
            setShowAddSongs(false);
          }}
        />
      )}
      {/* Notification Toast */}
      {notification && (
        <NotificationToast notification={notification} lift={selectionMode && bulk.count !== 0} />
      )}
      {bulkRemoveConfirm && (
        <ConfirmModal
          title="Remove Songs"
          message={
            <>
              Remove{' '}
              <span className="text-fg font-semibold">
                {bulk.count} song{bulk.count !== 1 ? 's' : ''}
              </span>{' '}
              from this playlist? The songs won&lsquo;t be deleted from the library.
            </>
          }
          confirmLabel="Remove"
          onConfirm={executeBulkRemove}
          onCancel={() => setBulkRemoveConfirm(false)}
        />
      )}
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

      {/* Bulk action bar */}
      {selectionMode && bulk.count > 0 && (
        <BulkActionBar
          count={bulk.count}
          loadedCount={songItems.length}
          totalCount={totalSongs}
          canDelete={canEdit}
          canTag={canEdit}
          deleteLabel="Remove selected"
          onDelete={handleBulkRemove}
          onTag={() => setBulkEditingOpen(true)}
          onSelectAll={() => bulk.selectAll(songItems.map((s) => s.id))}
          onDeselectAll={bulk.clearAll}
          isDeleting={bulkRemoving}
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
