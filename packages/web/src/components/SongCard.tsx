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
import { Card } from './ui/Card';
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
    return (
      <Card
        hoverable={!!isAdminView}
        animate
        className={`rounded-xl flex flex-col${isAdminView ? ' group cursor-pointer' : ''}`}
        style={gridStyle}
        data-song-edit-container
        onClick={() => canEdit && setOpenSongId(isOpen ? null : song.id)}
      >
        {/* Thumbnail with play overlay */}
        <div
          role="img"
          aria-label={song.nickname || song.title}
          className="relative aspect-square bg-elevated overflow-hidden rounded-xl clay-flat m-3 mb-0"
        >
          <img
            src={song.artwork ?? song.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover scale-[1.33]"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />

          {/* Action buttons — bottom left */}
          <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1">
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

          {/* Duration badge + volume indicator — bottom right */}
          <div className="absolute bottom-2 right-2 z-20 flex flex-col items-end gap-px">
            <DurationBadge seconds={song.duration} variant="overlay" />
            <VolumeBoostBadge volumeBoost={song.volumeBoost} className="text-[10px]" />
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

        {/* Info */}
        <div className="p-4 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-body font-semibold text-sm text-fg leading-tight line-clamp-2 min-w-0">
              {song.nickname || song.title}
            </p>
          </div>
          {song.nickname && <p className="text-[11px] text-faint truncate">{song.title}</p>}
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

  return (
    <Card
      hoverable={!!isAdminView}
      className="rounded-lg flex flex-col"
      data-song-id={song.id}
      data-song-edit-container
    >
      <div
        className="flex items-center gap-3 md:gap-4 px-4 py-4"
        onClick={() => canEdit && setOpenSongId(isOpen ? null : song.id)}
        onKeyDown={(e) => {
          if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpenSongId(isOpen ? null : song.id);
          }
        }}
        role="button"
        tabIndex={0}
        style={canEdit ? { cursor: 'pointer' } : undefined}
        onMouseEnter={() => setIsRowHovered(true)}
        onMouseLeave={() => setIsRowHovered(false)}
      >
        <div className="overflow-hidden w-16 h-16 rounded border border-border shrink-0">
          <img
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname || song.title}
            className="w-full h-full object-cover scale-[1.33]"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <p className="text-sm font-semibold text-fg truncate leading-tight flex items-center gap-1.5">
            <MusicNoteIcon size={13} weight="fill" className="shrink-0 text-muted" />
            {song.nickname || song.title}
          </p>
          <div className="flex items-center gap-2.5 flex-wrap text-xs text-muted min-w-0">
            {song.artist && (
              <span className="truncate max-w-[16ch] flex items-center gap-1">
                <UserIcon size={12} weight="fill" className="shrink-0" />
                {song.artist}
              </span>
            )}
            {song.album && (
              <span className="truncate max-w-[20ch] flex items-center gap-1">
                <DiscIcon size={12} weight="fill" className="shrink-0" />
                {song.album}
              </span>
            )}
            {tags.length > 0 && <TagTicker tags={tags} isHovered={isRowHovered} />}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap text-xs text-muted min-w-0">
            {sourceKey && (
              <span className="flex items-center shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5">
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
          className="w-12 h-12 disabled:opacity-50"
        />
        <ContextMenuTrigger
          ref={triggerRef}
          onToggle={() => setMenuOpen((v) => !v)}
          isOpen={menuOpen}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="w-12 h-12"
        />
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
};

SongCardInner.displayName = 'SongCard';

export const SongCard = React.memo(SongCardInner);

export default SongCard;
