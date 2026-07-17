import type { Playlist, Song } from '@alfira-bot/server/shared';
import { DiscIcon, MusicNoteIcon, UserIcon } from '@phosphor-icons/react';
import React, { useMemo, useState } from 'react';
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

  const canEdit = isAdminView || hasPermission('songs.edit');
  const canDelete = isAdminView || hasPermission('songs.delete');

  const { menuOpen, setMenuOpen, triggerRef, menuItems } = useSongActions({
    song,
    canEdit,
    canDelete,
    playlists: playlists ?? [],
    onAddToQueue,
    ...(onDelete ? { onDelete: () => onDelete(song.id) } : {}),
    onRemove,
    removeLabel,
  });

  const gridStyle = useMemo(
    () => ({ animationDelay: `${Math.min((delay ?? 0) * 30, 300)}ms` }),
    [delay]
  );

  // ── Grid variant ──────────────────────────────────────────────────────

  if (variant === 'grid') {
    const tags = song.tags ?? [];

    const handleGridClick = () => {
      if (selectionMode) {
        onToggleSelect?.();
      } else if (canEdit) {
        setOpenSongId(isOpen ? null : song.id);
      }
    };

    return (
      <Card
        hoverable={!!isAdminView && !selectionMode}
        className={`rounded-lg flex flex-col${(isAdminView && !selectionMode) || selectionMode ? ' cursor-pointer' : ''}${selectionMode ? ' select-none hover:ring-2 hover:ring-accent/50' : ''}${isAdminView && !selectionMode ? ' group' : ''}`}
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
            <div className='absolute top-2 left-2 z-10' onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={isSelected} onChange={() => onToggleSelect?.()} size='md' />
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
              <span className='line-clamp-2'>{song.nickname || song.title}</span>
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
              <PlayButton onClick={onPlay} isPlaying={!!isPlaying} />
              <ContextMenuTrigger
                ref={triggerRef}
                onToggle={() => setMenuOpen((v) => !v)}
                isOpen={menuOpen}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </div>
          </div>

          {menuOpen && (
            <ContextMenu
              items={menuItems}
              isOpen={menuOpen}
              onClose={() => setMenuOpen(false)}
              triggerRef={triggerRef}
            />
          )}
        </div>

        {/* Inline edit panel */}
        <div className={`expand-panel ${isOpen ? 'expanded' : ''}`}>
          <SongEditPanel song={song} isOpen={isOpen} onClose={() => setOpenSongId(null)} />
        </div>
      </Card>
    );
  }

  // ── List variant ──────────────────────────────────────────────────────

  const tags = song.tags ?? [];

  const handleListClick = () => {
    if (selectionMode) {
      onToggleSelect?.();
    } else if (canEdit) {
      setOpenSongId(isOpen ? null : song.id);
    }
  };

  return (
    <Card
      hoverable={!!isAdminView && !selectionMode}
      className={`rounded-lg flex flex-col${selectionMode ? ' select-none hover:ring-2 hover:ring-accent/50' : ''}${isSelected ? ' ring-2 ring-accent' : ''}`}
      data-song-id={song.id}
      data-song-edit-container
    >
      <button
        type='button'
        className='flex items-center gap-3 md:gap-4 px-4 py-4 w-full text-left bg-transparent border-0'
        onClick={handleListClick}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !selectionMode) {
            e.preventDefault();
            if (canEdit) setOpenSongId(isOpen ? null : song.id);
          }
        }}
        style={canEdit || selectionMode ? { cursor: 'pointer' } : undefined}
        onMouseEnter={() => setIsRowHovered(true)}
        onMouseLeave={() => setIsRowHovered(false)}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={isSelected} onChange={() => onToggleSelect?.()} size='md' />
          </span>
        )}

        <div className='overflow-hidden w-16 h-16 rounded border border-border shrink-0 bg-elevated'>
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname || song.title}
            className='w-full h-full'
            imageClassName='scale-[1.33]'
          />
        </div>
        <div className='flex-1 min-w-0 flex flex-col justify-center gap-1.5'>
          <p className='text-sm font-semibold text-fg leading-tight flex items-center gap-1.5 min-w-0'>
            <MusicNoteIcon size={13} weight='fill' className='shrink-0 text-muted' />
            <span className='truncate'>{song.nickname || song.title}</span>
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
        <PlayButton
          onClick={onPlay}
          isPlaying={!!isPlaying}
          className='w-12 h-12 disabled:opacity-50'
        />
        <ContextMenuTrigger
          ref={triggerRef}
          onToggle={() => setMenuOpen((v) => !v)}
          isOpen={menuOpen}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className='w-12 h-12'
        />
        {menuOpen && (
          <ContextMenu
            items={menuItems}
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            triggerRef={triggerRef}
          />
        )}
      </button>

      {/* Inline edit panel */}
      <div className={`expand-panel ${isOpen ? 'expanded' : ''}`}>
        <SongEditPanel song={song} isOpen={isOpen} onClose={() => setOpenSongId(null)} />
      </div>
    </Card>
  );
};

SongCardInner.displayName = 'SongCard';

export const SongCard = React.memo(SongCardInner);

export default SongCard;
