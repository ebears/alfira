import { type Playlist, type PlaylistDetail, type Song, type TagItem } from '@alfira/server/shared';
import { type BulkEditData, type FetchSongsOptions } from '@alfira/server/shared/api';
import { fetchTags, updatePlaylistTag } from '@alfira/server/shared/api';
import {
  BombIcon,
  CaretLeftIcon,
  GhostIcon,
  LockIcon,
  LockOpenIcon,
  PencilSimple,
  PlayCircleIcon,
  PlayIcon,
  PlusCircleIcon,
  ShuffleIcon,
  TagIcon,
} from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
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
import AddSongsModal from '../components/AddSongsModal';
import BulkActionBar from '../components/BulkActionBar';
import BulkEditModal from '../components/BulkEditModal';
import ConfirmModal from '../components/ConfirmModal';
import { type MenuItem } from '../components/ContextMenu';
import { ContextMenu, ContextMenuTrigger } from '../components/ContextMenu';
import EmptyState from '../components/EmptyState';
import ListToolbar from '../components/ListToolbar';
import NotificationToast from '../components/NotificationToast';
import { Button } from '../components/ui/Button';
import { cooldownButtonProps } from '../components/ui/cooldownButtonProps';
import { VirtualSongGrid } from '../components/VirtualSongGrid';
import { VirtualSongList } from '../components/VirtualSongList';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import { usePlayerState } from '../context/PlayerContext';
import { useAddToQueue } from '../hooks/useAddToQueue';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { useCooldownGuard } from '../hooks/useCooldownGuard';
import { useNotification } from '../hooks/useNotification';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { onSocketEvent } from '../hooks/useSocket';
import { pageVariants, viewTransition } from '../lib/motion';
import { apiErrorMessage, notifyUnlessRateLimit } from '../utils/api';
import { getTagColorClasses } from '../utils/tagColors';

type PlaylistDetailMeta = Omit<PlaylistDetail, 'songs'>;

const ITEMS_PER_PAGE = 48;

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
  const { coolingDown, statusTitle, handleCooldownClick } = useCooldownGuard();

  const cooldown = useMemo(
    () => ({ coolingDown, statusTitle, onCooldownClick: handleCooldownClick }),
    [coolingDown, statusTitle, handleCooldownClick]
  );

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
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('alfira-playlist-view') as 'list' | 'grid' | null) ?? 'list'
  );

  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fetch tags for tag change submenu
  useEffect(() => {
    if (isAdminView || user?.discordId) {
      void (async () => {
        try {
          const tags = await fetchTags();
          setTags(tags);
        } catch {
          // Tags are non-critical — fail silently
        }
      })();
    }
  }, [isAdminView, user?.discordId]);

  const { state: queueState } = usePlayerState();

  const idRef = useRef(id);
  const isAdminViewRef = useRef(isAdminView);
  idRef.current = id;
  isAdminViewRef.current = isAdminView;

  // Search & filter state
  const [search, setSearch] = useState('');
  // Sort & filter state
  const [sort, setSort] = useState('position');
  const [order, setOrder] = useState('desc');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterSources, setFilterSources] = useState<string[]>([]);

  // Build stable fetch options for the hook
  const songsOpts = useMemo<FetchSongsOptions>(() => {
    const opts: FetchSongsOptions = {};
    if (search) {
      opts.search = search;
    }
    if (sort !== 'position') {
      opts.sort = sort;
    }
    if (order !== 'desc') {
      opts.order = order;
    }
    const t = filterTags.join(',');
    const s = filterSources.join(',');
    if (t) {
      opts.tags = t;
    }
    if (s) {
      opts.source = s;
    }
    return opts;
  }, [search, sort, order, filterTags, filterSources]);

  // ── Comparator for re-sorting after real-time mutations ──────────────
  type PS = PlaylistDetail['songs'][number];
  const playlistSongCompareFn = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    return (a: PS, b: PS): number => {
      switch (sort) {
        case 'title': {
          // Sort by display name: nickname if set, otherwise title
          const aName = a.song.nickname || a.song.title || '';
          const bName = b.song.nickname || b.song.title || '';
          return dir * aName.localeCompare(bName, undefined, { sensitivity: 'base' });
        }
        case 'artist': {
          const aArt = a.song.artist || '';
          const bArt = b.song.artist || '';
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
          const aAlb = a.song.album || '';
          const bAlb = b.song.album || '';
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
          return dir * ((a.song.duration ?? 0) - (b.song.duration ?? 0));
        case 'createdAt':
          return (
            dir * (new Date(a.song.createdAt).getTime() - new Date(b.song.createdAt).getTime())
          );
        default:
          // position — lower position first for asc, higher first for desc
          return dir * (a.position - b.position);
      }
    };
  }, [sort, order]);

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
    fetchNextPage,
    retry,
    refetch,
  } = usePaginatedData<
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
        },
      };
    },
    limit: ITEMS_PER_PAGE,
    deps: [
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- route param is always defined
      id!,
      isAdminView,
      songsOpts,
    ],
    compareFn: playlistSongCompareFn,
  });

  // Derive PlaylistDetail for JSX — metadata from the hook, songs from items
  const playlistDetail = useMemo(
    () => (playlistMeta ? { ...playlistMeta, songs } : null),
    [playlistMeta, songs]
  );

  // Stable ref for callbacks — avoids playlistDetail changing every render
  const playlistDetailRef = useRef(playlistDetail);
  playlistDetailRef.current = playlistDetail;

  const isOwner = user?.discordId === playlistDetail?.createdBy;
  const canEdit = isAdminView || isOwner || hasPermission('songs.edit');
  const canBulk = canEdit;
  const isSmart = !!playlistDetail?.tagNameLower;

  const songItems: Song[] = useMemo(() => songs.map((ps) => ps.song), [songs]);

  const pageStyle = useMemo(() => ({ paddingBottom: 0 }), []);
  const handleGoBack = useCallback(() => navigate('/playlists'), [navigate]);
  const handleToggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const handleCloseMenu = useCallback(() => setMenuOpen(false), []);
  const handleSortChange = useCallback((field: string, newOrder: string) => {
    setSort(field);
    setOrder(newOrder);
  }, []);
  const handleAddTag = useCallback((tag: string) => {
    const t = tag.toLowerCase();
    setFilterTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  }, []);
  const handleRemoveTag = useCallback(
    (tag: string) => setFilterTags((prev) => prev.filter((t) => t !== tag)),
    []
  );
  const handleAddSource = useCallback(
    (s: string) => setFilterSources((prev) => (prev.includes(s) ? prev : [...prev, s])),
    []
  );
  const handleRemoveSource = useCallback(
    (s: string) => setFilterSources((prev) => prev.filter((x) => x !== s)),
    []
  );
  const handleToggleSelectionMode = useCallback(() => {
    if (selectionMode) {
      bulk.clearAll();
    }
    setSelectionMode((v) => !v);
  }, [selectionMode, bulk]);
  const handleViewModeChange = useCallback((mode: 'list' | 'grid') => {
    localStorage.setItem('alfira-playlist-view', mode);
    setViewMode(mode);
  }, []);
  const handleSongDelete = useCallback(
    (id: string) => {
      const ps = songs.find((p) => p.songId === id);
      if (ps) {
        setRemoveId(ps.songId);
      }
    },
    [songs]
  );
  const handleCloseAddSongs = useCallback(() => setShowAddSongs(false), []);
  const handleAddSongsAdded = useCallback(() => {
    refetch();
    setShowAddSongs(false);
  }, [refetch]);
  const handleCancelBulkRemove = useCallback(() => setBulkRemoveConfirm(false), []);
  const handleCancelRemove = useCallback(() => setRemoveId(null), []);
  const handleCancelDeletePlaylist = useCallback(() => setDeleteConfirm(false), []);
  const handleCancelMakeSmart = useCallback(() => setTagSmartConfirm(null), []);
  const handleBulkTag = useCallback(() => setBulkEditingOpen(true), []);
  const handleSelectAll = useCallback(
    () => bulk.selectAll(songs.map((ps) => ps.songId)),
    [bulk, songs]
  );
  const handleEmptyAdd = useCallback(() => setShowAddSongs(true), []);

  const handleCloseBulkEdit = useCallback(() => setBulkEditingOpen(false), []);

  // ── Socket: playlist updated (rename, visibility, song count changes) ──
  useEffect(() => {
    const handlePlaylistUpdated = (updated: Playlist) => {
      if (updated.id !== idRef.current) {
        return;
      }
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

  const handleRemoveSong = useCallback(
    async (songId: string) => {
      if (!playlistDetail) {
        return;
      }
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
    },
    [playlistDetail, removeItem]
  );

  const handleConfirmRemove = useCallback(() => {
    if (removeId) {
      void handleRemoveSong(removeId);
    }
  }, [removeId, handleRemoveSong]);

  // ── Bulk actions ─────────────────────────────────────────────────────
  const handleBulkRemove = useCallback(() => {
    setBulkRemoveConfirm(true);
  }, []);

  const executeBulkRemove = useCallback(async () => {
    const pd = playlistDetailRef.current;
    if (!pd || bulk.count === 0) {
      return;
    }
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
        await bulkRemoveSongsFromPlaylist(pd.id, allIds.slice(i, i + chunkSize));
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
  }, [bulk, notify, removeItem]);

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

  const handleDeletePlaylist = useCallback(async () => {
    if (!playlistDetail) {
      return;
    }
    await deletePlaylist(playlistDetail.id);
    void navigate('/playlists');
  }, [playlistDetail, navigate]);

  const handleConfirmDeletePlaylist = useCallback(() => {
    setDeleteConfirm(false);
    void handleDeletePlaylist();
  }, [handleDeletePlaylist]);

  const handleToggleVisibility = async () => {
    if (!playlistDetail) {
      return;
    }
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
      const pd = playlistDetailRef.current;
      if (!pd) {
        return;
      }
      setPlayingSongId(songId);
      try {
        await startPlayback({
          playlistId: pd.id,
          mode,
          loop: queueState.loopMode,
          startFromSongId: songId,
        });
      } catch (err: unknown) {
        if (throwErrors) {
          throw err;
        }
        notifyUnlessRateLimit(err, 'Could not start playback.', notify);
      } finally {
        setPlayingSongId(null);
      }
    },
    [queueState.loopMode, notify]
  );

  const handleConvertToRegular = useCallback(async () => {
    const pd = playlistDetailRef.current;
    if (!pd) {
      return;
    }
    try {
      await updatePlaylistTag(pd.id, null);
      refetch();
      notify('Playlist converted to regular playlist', 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Could not convert playlist.'), 'error', 5000);
    }
  }, [refetch, notify]);

  const handleChangeTag = useCallback(
    async (tagNameLower: string) => {
      const pd = playlistDetailRef.current;
      if (!pd) {
        return;
      }
      try {
        await updatePlaylistTag(pd.id, tagNameLower);
        refetch();
        notify('Playlist tag updated', 'success');
      } catch (err: unknown) {
        notify(apiErrorMessage(err, 'Could not update playlist tag.'), 'error', 5000);
      }
    },
    [refetch, notify]
  );

  const handleMakeSmart = useCallback(
    async (tagNameLower: string) => {
      const pd = playlistDetailRef.current;
      if (!pd) {
        return;
      }
      setTagSmartConfirm(null);
      try {
        await updatePlaylistTag(pd.id, tagNameLower);
        refetch();
        notify('Playlist now tracking tag', 'success');
      } catch (err: unknown) {
        notify(apiErrorMessage(err, 'Could not update playlist tag.'), 'error', 5000);
      }
    },
    [refetch, notify]
  );

  const handleConfirmMakeSmart = useCallback(() => {
    if (tagSmartConfirm) {
      void handleMakeSmart(tagSmartConfirm);
    }
  }, [tagSmartConfirm, handleMakeSmart]);

  const handleAddPlaylistToQueue = useCallback(async () => {
    const pd = playlistDetailRef.current;
    if (!pd) {
      return;
    }
    try {
      await startPlayback({
        playlistId: pd.id,
        mode: 'sequential',
        loop: queueState.loopMode,
      });
      notify(`Added "${pd.name}" to queue`, 'success');
    } catch (err: unknown) {
      notify(apiErrorMessage(err, 'Could not add to queue.'), 'error', 5000);
    }
  }, [queueState.loopMode, notify]);

  const tagSubmenuItems = tags.map((tag) => ({
    id: tag.nameLower,
    label: tag.canonicalName,
  }));

  const menuItems: MenuItem[] = [
    {
      id: 'add-to-queue',
      label: 'Add to Queue',
      icon: <PlusCircleIcon size={14} weight='duotone' />,
      disabled: songs.length === 0,
      onClick: handleAddPlaylistToQueue,
    },
    ...(isOwner || isAdminView
      ? [
          {
            id: 'rename',
            label: 'Rename',
            icon: <PencilSimple size={14} weight='duotone' />,
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
              <LockOpenIcon size={14} weight='duotone' />
            ) : (
              <LockIcon size={14} weight='duotone' />
            ),
            onClick: handleToggleVisibility,
          } as MenuItem,
          ...(isSmart
            ? [
                {
                  id: 'change-tag',
                  label: 'Change Tracked Tag',
                  icon: <TagIcon size={14} weight='duotone' />,
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
                  icon: <PlayCircleIcon size={14} weight='duotone' />,
                  onClick: handleConvertToRegular,
                } as MenuItem,
              ]
            : [
                {
                  id: 'add-songs',
                  label: 'Add Songs',
                  icon: <PlayCircleIcon size={14} weight='duotone' />,
                  onClick: () => setShowAddSongs(true),
                } as MenuItem,
                {
                  id: 'make-smart',
                  label: 'Track a Tag',
                  icon: <TagIcon size={14} weight='duotone' />,
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
            icon: <BombIcon size={14} weight='duotone' />,
            danger: true,
            onClick: () => setDeleteConfirm(true),
          } as MenuItem,
        ]
      : []),
  ];

  if (isLoading || !hasLoaded) {
    return <DetailSkeleton />;
  }
  if (!playlistDetail) {
    return null;
  }

  return (
    <div className='p-4 md:p-8 flex flex-col min-h-0 h-full' style={pageStyle}>
      {/* Back */}
      <Button
        variant='inherit'
        surface='surface'
        onClick={handleGoBack}
        className='flex items-center gap-1.5 font-mono text-xs mb-4 md:mb-6 min-h-11 md:min-h-0'
      >
        <CaretLeftIcon size={16} weight='duotone' className='md:w-3.5 md:h-3.5' />
        playlists
      </Button>

      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-start justify-between mb-6 md:mb-8 gap-4'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <h1 className='font-display text-3xl md:text-4xl text-fg tracking-wider'>
              {playlistDetail.name}
            </h1>
            {playlistDetail.isPrivate && (
              <span className='text-muted text-sm' title='Private playlist'>
                <GhostIcon size={14} weight='duotone' className='inline mr-1' />
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
                    <TagIcon size={12} weight='duotone' />
                    {displayName}
                  </span>
                );
              })()}
          </div>
          <p className='font-mono text-xs text-muted mt-2'>
            {songItems.length} {songItems.length === 1 ? 'track' : 'tracks'}
            {playlistDetail.tagNameLower ? (
              <span className='text-accent'> • auto-tracked</span>
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

        <div className='flex gap-2 shrink-0 items-center'>
          <Button
            variant='secondary'
            className='rounded-full!'
            {...cooldownButtonProps(cooldown, {
              onClick: () => {
                void handlePlayFromSong(songs[0]?.songId, 'random');
              },
              disabled: songItems.length === 0,
              title: 'Shuffle',
            })}
          >
            <ShuffleIcon size={18} weight='duotone' />
          </Button>
          <Button
            variant='primary'
            className='text-xs flex items-center gap-1.5'
            {...cooldownButtonProps(cooldown, {
              onClick: () => {
                void handlePlayFromSong(songs[0]?.songId, 'sequential');
              },
              disabled: songItems.length === 0,
              title: 'Play',
            })}
          >
            <PlayIcon size={14} weight='duotone' /> Play
          </Button>
          <ContextMenuTrigger
            ref={menuTriggerRef}
            onToggle={handleToggleMenu}
            isOpen={menuOpen}
            surface='surface'
            size='default'
            className='rounded-full!'
          />
          {menuOpen && (
            <ContextMenu
              items={menuItems}
              isOpen={menuOpen}
              onClose={handleCloseMenu}
              triggerRef={menuTriggerRef}
            />
          )}
        </div>
      </div>

      <ListToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder='Search by title, nickname, artist, album, or tag...'
        sortOptions={[...SORT_OPTIONS]}
        sort={sort}
        order={order as 'asc' | 'desc'}
        onSortChange={handleSortChange}
        defaultSort='position'
        textSortFields={['title', 'artist', 'album']}
        filterTags={filterTags}
        filterSources={filterSources}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onAddSource={handleAddSource}
        onRemoveSource={handleRemoveSource}
        showBulkToggle={canBulk}
        selectionMode={selectionMode}
        onToggleSelectionMode={handleToggleSelectionMode}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {/* Song list */}
      {songItems.length === 0 && !isLoading ? (
        isSmart ? (
          <EmptyState
            title='No Songs Yet'
            message={`This playlist tracks the "${tags.find((t) => t.nameLower === playlistDetail.tagNameLower)?.canonicalName ?? playlistDetail.tagNameLower}" tag. Tag some songs to populate it.`}
          />
        ) : (
          <EmptyState
            title='Empty Playlist'
            isAdmin={canEdit}
            onAdd={handleEmptyAdd}
            addLabel='add some songs'
          />
        )
      ) : (
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
                items={songItems}
                isAdminView={isAdminView}
                playlists={[]}
                isLoading={isLoading}
                isFetching={isFetching}
                isError={isError}
                hasMore={hasMore}
                hasLoaded={!isLoading}
                playingId={playingSongId}
                onRetry={retry}
                onFetchMore={fetchNextPage}
                onDelete={selectionMode ? undefined : handleSongDelete}
                onPlay={handlePlayFromSong}
                onAddToQueue={handleAddToQueue}
                selectionMode={selectionMode}
                isSelected={bulk.isSelected}
                onToggleSelect={bulk.toggle}
                emptyTitle='No Songs'
                emptyMessage='Add songs to this playlist'
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
                items={songItems}
                isAdminView={isAdminView}
                playlists={[]}
                isLoading={isLoading}
                isFetching={isFetching}
                isError={isError}
                hasMore={hasMore}
                hasLoaded={!isLoading}
                playingId={playingSongId}
                onRetry={retry}
                onFetchMore={fetchNextPage}
                onDelete={selectionMode ? undefined : handleSongDelete}
                onPlay={handlePlayFromSong}
                onAddToQueue={handleAddToQueue}
                selectionMode={selectionMode}
                isSelected={bulk.isSelected}
                onToggleSelect={bulk.toggle}
                emptyTitle='No Songs'
                emptyMessage='Add songs to this playlist'
              />
            </m.div>
          )}
        </AnimatePresence>
      )}

      {/* Modals */}
      {showAddSongs && (
        <AddSongsModal
          playlist={playlistDetail}
          onClose={handleCloseAddSongs}
          onAdded={handleAddSongsAdded}
        />
      )}
      {/* Notification Toast */}
      {notification && (
        <NotificationToast notification={notification} lift={selectionMode && bulk.count !== 0} />
      )}
      {bulkRemoveConfirm && (
        <ConfirmModal
          title='Remove Songs'
          message={
            <>
              Remove{' '}
              <span className='text-fg font-semibold'>
                {bulk.count} song{bulk.count !== 1 ? 's' : ''}
              </span>{' '}
              from this playlist? The songs won&lsquo;t be deleted from the library.
            </>
          }
          confirmLabel='Remove'
          onConfirm={executeBulkRemove}
          onCancel={handleCancelBulkRemove}
        />
      )}
      {removeId && (
        <ConfirmModal
          title='Remove Song'
          message={
            <>
              Remove{' '}
              <span className='text-fg font-semibold'>
                "{songs.find((ps) => ps.songId === removeId)?.song.title}"
              </span>{' '}
              from this playlist? The song won't be deleted from the library.
            </>
          }
          confirmLabel='Remove'
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      )}
      {deleteConfirm && (
        <ConfirmModal
          title='Delete Playlist'
          message='This playlist will be permanently deleted. This cannot be undone.'
          confirmLabel='Delete'
          onConfirm={handleConfirmDeletePlaylist}
          onCancel={handleCancelDeletePlaylist}
        />
      )}
      {tagSmartConfirm && (
        <ConfirmModal
          title='Track a Tag'
          message={
            <>
              This will convert the playlist to auto-track the "
              <span className='text-fg font-semibold'>
                {tags.find((t) => t.nameLower === tagSmartConfirm)?.canonicalName ??
                  tagSmartConfirm}
              </span>
              " tag. All current songs not matching this tag will be removed.
            </>
          }
          confirmLabel='Convert'
          onConfirm={handleConfirmMakeSmart}
          onCancel={handleCancelMakeSmart}
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
          deleteLabel='Remove selected'
          onDelete={handleBulkRemove}
          onTag={handleBulkTag}
          onSelectAll={handleSelectAll}
          onDeselectAll={bulk.clearAll}
          isDeleting={bulkRemoving}
        />
      )}

      {/* Bulk edit modal */}
      {bulkEditingOpen && (
        <BulkEditModal
          count={bulk.count}
          onApply={handleBulkEdit}
          onClose={handleCloseBulkEdit}
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
    <div className='p-8'>
      <div className='skeleton h-3 w-20 mb-6 rounded' />
      <div className='skeleton h-12 w-64 mb-2 rounded' />
      <div className='skeleton h-3 w-24 mb-8 rounded' />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={`skeleton-${i}`} className='flex items-center gap-4 py-3'>
          <div className='skeleton w-6 h-3 rounded' />
          <div className='skeleton w-10 h-7 rounded' />
          <div className='skeleton h-3 flex-1 rounded' />
          <div className='skeleton h-3 w-12 rounded' />
        </div>
      ))}
    </div>
  );
}
