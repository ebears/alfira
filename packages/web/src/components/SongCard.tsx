import { type Playlist, type Song } from '@alfira/server/shared';
import { DiscIcon, MicrophoneStageIcon, MusicNoteIcon, UserIcon } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { usePermissions } from '../context/PermissionsContext';
import { useSongEdit } from '../context/SongEditContext';
import { useSongActions } from '../hooks/useSongActions';
import { getSourceKey } from '../utils/source';
import { ContextMenu, ContextMenuTrigger } from './ContextMenu';
import SongEditPanel from './SongEditPanel';
import { SourceIcon } from './SourceIcons';
import TagTicker from './TagTicker';
import { ArtworkImage } from './ui/ArtworkImage';
import { Card } from './ui/Card';
import Checkbox from './ui/Checkbox';
import { DurationBadge } from './ui/DurationBadge';
import { PlayButton } from './ui/PlayButton';
import { VolumeBoostBadge } from './ui/VolumeBoostBadge';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface SongCardProps {
  song: Song;
  variant: 'grid' | 'list';
  playlists?: Playlist[];
  delay?: number;
  isAdminView?: boolean;
  onDelete?: (id: string) => void;
  /** When provided, context menu shows "Remove" (playlist detail context) */
  onRemove?: () => void;
  removeLabel?: string;
  onPlay: () => void;
  isPlaying?: boolean;
  onAddToQueue: () => void;
  /** Show a selection checkbox (bulk action mode) */
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function SongCardInner({
  song,
  variant,
  playlists,
  delay,
  isAdminView,
  onDelete,
  onRemove,
  removeLabel,
  onPlay,
  isPlaying,
  onAddToQueue,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: SongCardProps) {
  const { openSongId, setOpenSongId } = useSongEdit();
  const { hasPermission } = usePermissions();
  const isOpen = openSongId === song.id;
  const [isRowHovered, setIsRowHovered] = useState(false);
  const sourceKey = useMemo(() => getSourceKey(song.sourceUrl), [song.sourceUrl]);

  const canEdit = isAdminView ?? hasPermission('songs.edit');
  const canDelete = isAdminView ?? hasPermission('songs.delete');

  // Stable wrapper for onDelete callback — song.id is stable per render cycle
  const handleDelete = useCallback(() => onDelete?.(song.id), [onDelete, song.id]);

  const { menuOpen, setMenuOpen, triggerRef, menuItems } = useSongActions({
    song,
    canEdit,
    canDelete,
    playlists: playlists ?? [],
    onAddToQueue,
    ...(onDelete ? { onDelete: handleDelete } : {}),
    onRemove,
    removeLabel,
  });

  const gridStyle = useMemo(
    () => ({ animationDelay: `${Math.min((delay ?? 0) * 30, 300)}ms` }),
    [delay]
  );

  // Stable callbacks for ContextMenu
  const handleMenuToggle = useCallback(() => {
    setMenuOpen((v) => !v);
  }, [setMenuOpen]);
  const handleMenuClose = useCallback(() => {
    setMenuOpen(false);
  }, [setMenuOpen]);
  const handleMenuMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Stable callbacks for inline edit panels
  const handleEditClose = useCallback(() => {
    setOpenSongId(null);
  }, [setOpenSongId]);

  // Stable callbacks for list variant
  const handleMouseEnter = useCallback(() => {
    setIsRowHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    setIsRowHovered(false);
  }, []);
  const pointerCursorStyle = useMemo(() => ({ cursor: 'pointer' }), []);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !selectionMode) {
        e.preventDefault();
        if (canEdit) {
          setOpenSongId(isOpen ? null : song.id);
        }
      }
    },
    [canEdit, isOpen, selectionMode, setOpenSongId, song.id]
  );

  const handleCheckboxOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleToggleSelect = useCallback(() => onToggleSelect?.(), [onToggleSelect]);

  // Stable motion props for the edit panel expand/collapse animation.
  const editPanelInitial = useMemo(() => ({ height: 0, opacity: 0 }), []);
  const editPanelAnimate = useMemo(() => ({ height: 'auto' as const, opacity: 1 }), []);
  const editPanelExit = useMemo(() => ({ height: 0, opacity: 0 }), []);
  const editPanelTransition = useRef({ duration: 0.2, ease: 'easeOut' as const });

  // ── Grid variant ──────────────────────────────────────────────────────

  // Grid/list click handlers — defined unconditionally before variant branches
  // to satisfy rules-of-hooks. Each is only used in its respective branch.
  const handleGridClick = useCallback(() => {
    if (selectionMode) {
      onToggleSelect?.();
    } else if (canEdit) {
      setOpenSongId(isOpen ? null : song.id);
    }
  }, [canEdit, isOpen, onToggleSelect, selectionMode, setOpenSongId, song.id]);

  const handleListClick = useCallback(() => {
    if (selectionMode) {
      onToggleSelect?.();
    } else if (canEdit) {
      setOpenSongId(isOpen ? null : song.id);
    }
  }, [canEdit, isOpen, onToggleSelect, selectionMode, setOpenSongId, song.id]);

  if (variant === 'grid') {
    const tags = song.tags ?? [];

    return (
      <Card
        hoverable={!!isAdminView}
        className={`flex flex-col rounded-lg relative${(isAdminView && !selectionMode) || selectionMode ? ' cursor-pointer' : ''}${selectionMode ? ` select-none${isSelected ? ' ring-accent ring-2' : ' hover:ring-accent/50 hover:ring-2'}` : ''}${!selectionMode ? ' group' : ''}`}
        style={gridStyle}
        data-song-edit-container
        onClick={handleGridClick}
      >
        {isSelected && (
          <div className='bg-accent/20 pointer-events-none absolute inset-0 z-10 rounded-lg' />
        )}

        {/* Clean thumbnail */}
        <div className='border-border bg-elevated relative m-3 mb-0 aspect-square overflow-hidden rounded-lg border'>
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt=''
            className='h-full w-full'
            imageClassName='scale-[1.33]'
          />
          {/* Selection checkbox overlay */}
          {selectionMode && (
            <div className='absolute top-2 left-2 z-20' onClick={handleCheckboxOverlayClick}>
              <Checkbox checked={isSelected} onChange={handleToggleSelect} size='md' />
            </div>
          )}
        </div>

        {/* Info */}
        <div className='flex flex-1 flex-col gap-1.5 p-4'>
          {/* Title + Source */}
          <div className='flex items-center justify-between gap-2'>
            <p className='text-fg flex min-w-0 items-center gap-1.5 text-sm leading-tight font-semibold'>
              <MusicNoteIcon size={13} weight='fill' className='text-muted shrink-0' />
              <span className='line-clamp-2'>{song.nickname ?? song.title}</span>
            </p>
            {sourceKey && (
              <span className='flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5'>
                <SourceIcon sourceKey={sourceKey} />
              </span>
            )}
          </div>
          {/* Artist + Duration */}
          <div className='text-muted flex items-center justify-between gap-2 overflow-hidden text-xs'>
            {song.artist ? (
              <span className='flex min-w-0 items-center gap-1'>
                <MicrophoneStageIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.artist}</span>
              </span>
            ) : (
              <span />
            )}
            <DurationBadge seconds={song.duration} />
          </div>

          {/* Album + VolumeBoost */}
          <div className='text-muted flex items-center justify-between gap-2 overflow-hidden text-xs'>
            {song.album ? (
              <span className='flex min-w-0 items-center gap-1'>
                <DiscIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.album}</span>
              </span>
            ) : (
              <span />
            )}
            <VolumeBoostBadge volumeBoost={song.volumeBoost} />
          </div>

          {/* Requested by */}
          {song.addedBy ? (
            <div className='text-muted flex items-center justify-between gap-2 overflow-hidden text-xs'>
              <span className='flex min-w-0 items-center gap-1'>
                <UserIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.addedByDisplayName ?? song.addedBy}</span>
              </span>
              <span />
            </div>
          ) : null}

          {/* Tags + Actions */}
          <div className='flex items-center justify-between gap-2 pt-1'>
            <div className='min-w-0'>{tags.length > 0 && <TagTicker tags={tags} />}</div>
            <div className='flex shrink-0 items-center gap-1'>
              <div
                className={
                  menuOpen
                    ? ''
                    : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
                }
              >
                <ContextMenuTrigger
                  ref={triggerRef}
                  onToggle={handleMenuToggle}
                  isOpen={menuOpen}
                  onMouseDown={handleMenuMouseDown}
                />
              </div>
              <PlayButton onClick={onPlay} isPlaying={!!isPlaying} />
            </div>
          </div>

          {menuOpen && (
            <ContextMenu
              items={menuItems}
              isOpen={menuOpen}
              onClose={handleMenuClose}
              triggerRef={triggerRef}
            />
          )}
        </div>

        {/* Inline edit panel */}
        <AnimatePresence>
          {isOpen && (
            <m.div
              initial={editPanelInitial}
              animate={editPanelAnimate}
              exit={editPanelExit}
              transition={editPanelTransition.current}
              className='overflow-hidden'
            >
              <SongEditPanel song={song} isOpen={isOpen} onClose={handleEditClose} />
            </m.div>
          )}
        </AnimatePresence>
      </Card>
    );
  }

  // ── List variant ──────────────────────────────────────────────────────

  const tags = song.tags ?? [];

  return (
    <Card
      hoverable={!!isAdminView}
      className={`flex flex-col rounded-lg relative${selectionMode ? ' hover:ring-accent/50 select-none hover:ring-2' : ''}${isSelected ? ' ring-accent ring-2' : ''}`}
      data-song-id={song.id}
      data-song-edit-container
    >
      {isSelected && (
        <div className='bg-accent/20 pointer-events-none absolute inset-0 z-10 rounded-lg' />
      )}

      <div
        role='button'
        tabIndex={canEdit || selectionMode ? 0 : -1}
        className='flex w-full items-center gap-3 border-0 bg-transparent px-4 py-4 text-left md:gap-4'
        onClick={handleListClick}
        onKeyDown={handleListKeyDown}
        style={canEdit || selectionMode ? pointerCursorStyle : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <span className='relative z-20' onClick={handleCheckboxOverlayClick}>
            <Checkbox checked={isSelected} onChange={handleToggleSelect} size='md' />
          </span>
        )}

        <div className='border-border bg-elevated h-16 w-16 shrink-0 overflow-hidden rounded border'>
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname ?? song.title}
            className='h-full w-full'
            imageClassName='scale-[1.33]'
          />
        </div>
        <div className='flex min-w-0 flex-1 flex-col justify-center gap-1.5'>
          <p className='text-fg flex min-w-0 items-center gap-1.5 text-sm leading-tight font-semibold'>
            <MusicNoteIcon size={13} weight='fill' className='text-muted shrink-0' />
            <span className='truncate'>{song.nickname ?? song.title}</span>
          </p>
          <div className='text-muted flex min-w-0 flex-wrap items-center gap-2.5 text-xs'>
            {song.artist && (
              <span className='flex max-w-[16ch] min-w-0 items-center gap-1'>
                <MicrophoneStageIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.artist}</span>
              </span>
            )}
            {song.album && (
              <span className='flex max-w-[20ch] min-w-0 items-center gap-1'>
                <DiscIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.album}</span>
              </span>
            )}
            {tags.length > 0 && <TagTicker tags={tags} isHovered={isRowHovered} />}
          </div>
          <div className='text-muted flex min-w-0 flex-wrap items-center gap-2.5 text-xs'>
            {sourceKey && (
              <span className='flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5'>
                <SourceIcon sourceKey={sourceKey} />
              </span>
            )}
            {song.addedBy && (
              <span className='flex max-w-[16ch] min-w-0 items-center gap-1'>
                <UserIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.addedByDisplayName ?? song.addedBy}</span>
              </span>
            )}
            <DurationBadge seconds={song.duration} />
            <VolumeBoostBadge volumeBoost={song.volumeBoost} />
          </div>
        </div>
        <div
          className={
            menuOpen
              ? ''
              : `opacity-0 transition-opacity duration-150 [@media(hover:none)]:opacity-100 ${isRowHovered ? 'opacity-100' : ''}`
          }
        >
          <ContextMenuTrigger
            ref={triggerRef}
            onToggle={handleMenuToggle}
            isOpen={menuOpen}
            onMouseDown={handleMenuMouseDown}
            className='h-12 w-12'
          />
        </div>
        <PlayButton
          onClick={onPlay}
          isPlaying={!!isPlaying}
          className='h-12 w-12 disabled:opacity-50'
        />
        {menuOpen && (
          <ContextMenu
            items={menuItems}
            isOpen={menuOpen}
            onClose={handleMenuClose}
            triggerRef={triggerRef}
          />
        )}
      </div>

      {/* Inline edit panel */}
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={editPanelInitial}
            animate={editPanelAnimate}
            exit={editPanelExit}
            transition={editPanelTransition.current}
            className='overflow-hidden'
          >
            <SongEditPanel song={song} isOpen={isOpen} onClose={handleEditClose} />
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

SongCardInner.displayName = 'SongCard';

export const SongCard = React.memo(SongCardInner);

export default SongCard;
