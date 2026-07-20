import { type Playlist, type Song } from '@alfira/server/shared';
import {
  ArrowSquareOutIcon,
  BombIcon,
  CassetteTapeIcon,
  UserIcon,
  VinylRecordIcon,
} from '@phosphor-icons/react';
import { useCallback, useMemo, useOptimistic, useRef, useState } from 'react';

import { addSongToPlaylist } from '../api/api';
import { type MenuItem } from '../components/ContextMenu';
import { useSongMenu } from '../context/SongMenuContext';
import { useNotification } from './useNotification';

interface UseSongActionsOptions {
  song: Song;
  canEdit: boolean;
  canDelete: boolean;
  playlists: Playlist[];
  onAddToQueue: () => void;
  onDelete?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}

export function useSongActions({
  song,
  canEdit,
  canDelete,
  playlists,
  onAddToQueue,
  onDelete,
  onRemove,
  removeLabel,
}: UseSongActionsOptions) {
  const { activeMenuSongId, setActiveMenuSongId } = useSongMenu();
  const menuOpen = activeMenuSongId === song.id;
  const setMenuOpen = useCallback(
    (open: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof open === 'function' ? open(menuOpen) : open;
      setActiveMenuSongId(next ? song.id : null);
    },
    [menuOpen, song.id, setActiveMenuSongId]
  );
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { notify } = useNotification();

  const [optimisticAdded, addOptimistic] = useOptimistic(
    addedTo,
    (state: Set<string>, playlistId: string) => new Set([...state, playlistId])
  );

  const handleAddToPlaylist = useCallback(
    async (playlistId: string) => {
      addOptimistic(playlistId);
      try {
        await addSongToPlaylist(playlistId, song.id);
        setAddedTo((prev) => new Set([...prev, playlistId]));
      } catch {
        notify('Failed to add song to playlist', 'error');
      }
    },
    [song.id, addOptimistic, notify]
  );

  const menuItems: MenuItem[] = useMemo(
    () => [
      // Always present
      {
        id: 'add-to-queue',
        label: 'Add to Up Next',
        icon: <VinylRecordIcon size={14} weight='duotone' />,
        onClick: onAddToQueue,
      },
      // (when onRemove is provided, skip full admin submenu)
      ...(onRemove
        ? [
            {
              id: 'remove',
              label: removeLabel ?? 'Remove',
              icon: <BombIcon size={14} weight='duotone' />,
              danger: true,
              onClick: onRemove,
            } as MenuItem,
          ]
        : [
            // Full admin submenu (when onDelete is provided, library context)
            ...(canEdit && onDelete
              ? [
                  {
                    id: 'add-to-playlist',
                    label: 'Add to playlist',
                    icon: <CassetteTapeIcon size={14} weight='duotone' />,
                    submenu: {
                      title: 'Add to playlist',
                      items: playlists.map((pl) => ({
                        id: pl.id,
                        label: pl.name,
                        disabled: optimisticAdded.has(pl.id),
                      })),
                      onSelect: handleAddToPlaylist,
                      emptyMessage: 'no playlists yet',
                    },
                  } as MenuItem,
                ]
              : []),
            {
              id: 'open-link',
              label: 'Open Link',
              icon: <ArrowSquareOutIcon size={14} weight='duotone' />,
              onClick: () => window.open(song.sourceUrl, '_blank'),
            },
            // Delete + Requested By (library context, can delete)
            ...(canDelete && onDelete
              ? [
                  {
                    id: 'delete',
                    label: 'Delete song',
                    icon: <BombIcon size={14} weight='duotone' />,
                    danger: true,
                    onClick: onDelete,
                  } as MenuItem,
                  {
                    id: 'user-info',
                    label: '',
                    icon: <UserIcon size={14} weight='duotone' />,
                    info: {
                      label: (song.addedByDisplayName ?? song.addedBy) || '',
                      icon: <UserIcon size={14} weight='duotone' />,
                    },
                    separatorBefore: true,
                  },
                ]
              : []),
          ]),
    ],
    [
      onAddToQueue,
      song.sourceUrl,
      song.addedByDisplayName,
      song.addedBy,
      onRemove,
      removeLabel,
      onDelete,
      canEdit,
      canDelete,
      playlists,
      optimisticAdded,
      handleAddToPlaylist,
    ]
  );

  return { menuOpen, setMenuOpen, triggerRef, menuItems };
}
