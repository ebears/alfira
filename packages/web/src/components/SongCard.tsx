import { type Playlist, type Song } from '@alfira/server/shared';
import { DiscIcon, MusicNoteIcon, UserIcon } from '@phosphor-icons/react';
import React, { useCallback, useMemo, useState } from 'react';

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
const SongCardInner = ({
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
}: SongCardProps) => {
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
  const handleMenuToggle = useCallback(() => setMenuOpen((v) => !v), [setMenuOpen]);
  const handleMenuClose = useCallback(() => setMenuOpen(false), [setMenuOpen]);
  const handleMenuMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Stable callbacks for inline edit panels
  const handleEditClose = useCallback(() => setOpenSongId(null), [setOpenSongId]);

  // Stable callbacks for list variant
  const handleMouseEnter = useCallback(() => setIsRowHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsRowHovered(false), []);
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
        hoverable={!!isAdminView && !selectionMode}
        className={`rounded-lg flex flex-col${(isAdminView && !selectionMode) || selectionMode ? ' cursor-pointer' : ''}${selectionMode ? ' select-none hover:ring-2 hover:ring-accent/50' : ''}${!selectionMode ? ' group' : ''}`}
        style={gridStyle}
        data-song-edit-container
        onClick={handleGridClick}
      >
        {/* Clean thumbnail */}
        <div className='relative aspect-square overflow-hidden rounded-lg border border-border m-3 mb-0 bg-elevated'>
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt=''
            className='w-full h-full'
            imageClassName='scale-[1.33]'
          />
          {/* Selection checkbox overlay */}
          {selectionMode && (
            <div className='absolute top-2 left-2 z-10' onClick={handleCheckboxOverlayClick}>
              <Checkbox checked={isSelected} onChange={handleToggleSelect} size='md' />
            </div>
          )}
          {isSelected && <div className='absolute inset-0 bg-accent/20 pointer-events-none' />}
        </div>

        {/* Info */}
        <div className='p-4 flex-1 flex flex-col gap-1.5'>
          {/* Title + Source */}
          <div className='flex items-center justify-between gap-2'>
            <p className='text-sm font-semibold text-fg leading-tight flex items-center gap-1.5 min-w-0'>
              <MusicNoteIcon size={13} weight='fill' className='shrink-0 text-muted' />
              <span className='line-clamp-2'>{song.nickname ?? song.title}</span>
            </p>
            {sourceKey && (
              <span className='flex items-center shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5'>
                <SourceIcon sourceKey={sourceKey} />
              </span>
            )}
          </div>
          {/* Artist + Duration */}
          <div className='flex items-center justify-between gap-2 text-xs text-muted overflow-hidden'>
            {song.artist ? (
              <span className='flex items-center gap-1 min-w-0'>
                <UserIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.artist}</span>
              </span>
            ) : (
              <span />
            )}
            <DurationBadge seconds={song.duration} />
          </div>

          {/* Album + VolumeBoost */}
          <div className='flex items-center justify-between gap-2 text-xs text-muted overflow-hidden'>
            {song.album ? (
              <span className='flex items-center gap-1 min-w-0'>
                <DiscIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.album}</span>
              </span>
            ) : (
              <span />
            )}
            <VolumeBoostBadge volumeBoost={song.volumeBoost} />
          </div>

          {/* Tags + Actions */}
          <div className='flex items-center justify-between gap-2 pt-1'>
            <div className='min-w-0'>{tags.length > 0 && <TagTicker tags={tags} />}</div>
            <div className='flex items-center gap-1 shrink-0'>
              <div
                className={
                  menuOpen
                    ? ''
                    : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-150'
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
        <div className={`expand-panel ${isOpen ? 'expanded' : ''}`}>
          <SongEditPanel song={song} isOpen={isOpen} onClose={handleEditClose} />
        </div>
      </Card>
    );
  }

  // ── List variant ──────────────────────────────────────────────────────

  const tags = song.tags ?? [];

  return (
    <Card
      hoverable={!!isAdminView && !selectionMode}
      className={`rounded-lg flex flex-col${selectionMode ? ' select-none hover:ring-2 hover:ring-accent/50' : ''}${isSelected ? ' ring-2 ring-accent' : ''}`}
      data-song-id={song.id}
      data-song-edit-container
    >
      <div
        role='button'
        tabIndex={canEdit || selectionMode ? 0 : -1}
        className='flex items-center gap-3 md:gap-4 px-4 py-4 w-full text-left bg-transparent border-0'
        onClick={handleListClick}
        onKeyDown={handleListKeyDown}
        style={canEdit || selectionMode ? pointerCursorStyle : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <span onClick={handleCheckboxOverlayClick}>
            <Checkbox checked={isSelected} onChange={handleToggleSelect} size='md' />
          </span>
        )}

        <div className='overflow-hidden w-16 h-16 rounded border border-border shrink-0 bg-elevated'>
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname ?? song.title}
            className='w-full h-full'
            imageClassName='scale-[1.33]'
          />
        </div>
        <div className='flex-1 min-w-0 flex flex-col justify-center gap-1.5'>
          <p className='text-sm font-semibold text-fg leading-tight flex items-center gap-1.5 min-w-0'>
            <MusicNoteIcon size={13} weight='fill' className='shrink-0 text-muted' />
            <span className='truncate'>{song.nickname ?? song.title}</span>
          </p>
          <div className='flex items-center gap-2.5 flex-wrap text-xs text-muted min-w-0'>
            {song.artist && (
              <span className='max-w-[16ch] flex items-center gap-1 min-w-0'>
                <UserIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.artist}</span>
              </span>
            )}
            {song.album && (
              <span className='max-w-[20ch] flex items-center gap-1 min-w-0'>
                <DiscIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.album}</span>
              </span>
            )}
            {tags.length > 0 && <TagTicker tags={tags} isHovered={isRowHovered} />}
          </div>
          <div className='flex items-center gap-2.5 flex-wrap text-xs text-muted min-w-0'>
            {sourceKey && (
              <span className='flex items-center shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5'>
                <SourceIcon sourceKey={sourceKey} />
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
              : `opacity-0 [@media(hover:none)]:opacity-100 transition-opacity duration-150 ${isRowHovered ? 'opacity-100' : ''}`
          }
        >
          <ContextMenuTrigger
            ref={triggerRef}
            onToggle={handleMenuToggle}
            isOpen={menuOpen}
            onMouseDown={handleMenuMouseDown}
            className='w-12 h-12'
          />
        </div>
        <PlayButton
          onClick={onPlay}
          isPlaying={!!isPlaying}
          className='w-12 h-12 disabled:opacity-50'
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
      <div className={`expand-panel ${isOpen ? 'expanded' : ''}`}>
        <SongEditPanel song={song} isOpen={isOpen} onClose={handleEditClose} />
      </div>
    </Card>
  );
};

SongCardInner.displayName = 'SongCard';

export const SongCard = React.memo(SongCardInner);

export default SongCard;
