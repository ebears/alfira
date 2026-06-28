import type { Playlist, Song } from '@alfira-bot/server/shared';
import { formatDuration } from '@alfira-bot/server/shared';
import { CircleNotchIcon, HeadphonesIcon, PlayIcon } from '@phosphor-icons/react';
import React, { useCallback, useMemo } from 'react';
import { useSongEdit } from '../context/SongEditContext';
import { useSongActions } from '../hooks/useSongActions';
import { ContextMenu, ContextMenuTrigger } from './ContextMenu';
import SongEditPanel from './SongEditPanel';
import { Button } from './ui/Button';

interface SongCardProps {
  song: Song;
  isAdmin: boolean;
  playlists: Playlist[];
  delay?: number;
  isAdminView?: boolean;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
  isPlaying: boolean;
  onAddToQueue: (id: string) => void;
}

const SongCardInner = ({
  song,
  isAdmin,
  playlists,
  delay,
  isAdminView,
  onDelete,
  onPlay,
  isPlaying,
  onAddToQueue,
}: SongCardProps) => {
  const { openSongId, setOpenSongId } = useSongEdit();
  const isOpen = openSongId === song.id;
  const style = useMemo(
    () => ({ animationDelay: `${Math.min((delay ?? 0) * 30, 300)}ms` }),
    [delay]
  );
  const handleDelete = useCallback(() => onDelete(song.id), [onDelete, song.id]);
  const handlePlay = useCallback(() => onPlay(song.id), [onPlay, song.id]);
  const handleAddToQueue = useCallback(() => onAddToQueue(song.id), [onAddToQueue, song.id]);

  const actionHandlers = useMemo(
    () => ({ onAddToQueue: handleAddToQueue, onDelete: handleDelete }),
    [handleAddToQueue, handleDelete]
  );

  const { menuOpen, setMenuOpen, triggerRef, menuItems } = useSongActions({
    song,
    isAdmin,
    playlists,
    ...actionHandlers,
  });

  return (
    <div
      className={`animate-fade-up opacity-0 flex flex-col bg-elevated rounded-xl clay-resting transition-all duration-100${isAdminView ? ' hover:clay-raised hover:-translate-y-px active:clay-flat active:translate-y-0 group cursor-pointer' : ''}`}
      style={style}
      data-song-edit-container
      onClick={() => isAdmin && setOpenSongId(isOpen ? null : song.id)}
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
          <Button
            variant="primary"
            size="icon"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              handlePlay();
            }}
            disabled={isPlaying}
            className="shrink-0 disabled:cursor-default"
            title="Play from this song"
          >
            {isPlaying ? (
              <CircleNotchIcon size={18} weight="bold" className="animate-spin" />
            ) : (
              <PlayIcon size={18} weight="duotone" />
            )}
          </Button>
          <ContextMenuTrigger
            ref={triggerRef}
            onToggle={() => setMenuOpen((v) => !v)}
            isOpen={menuOpen}
            onMouseDown={(e) => e.preventDefault()}
          />
        </div>

        {/* Duration badge + volume indicator — bottom right */}
        <div className="absolute bottom-2 right-2 z-20 flex flex-col items-end gap-px">
          <span className="font-mono text-[10px] text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
            {formatDuration(song.duration)}
          </span>
          {song.volumeBoost != null && song.volumeBoost !== 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px]"
              style={{ color: song.volumeBoost > 0 ? '#22c55e' : '#eab308' }}
            >
              {song.volumeBoost > 0 ? '+' : ''}
              {song.volumeBoost}%
              <HeadphonesIcon size={11} weight="fill" />
            </span>
          )}
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
    </div>
  );
};

SongCardInner.displayName = 'SongCard';

export const SongCard = React.memo(SongCardInner);

export default SongCard;
