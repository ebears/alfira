import type { Playlist, Song } from '@alfira-bot/server/shared';
import { formatDuration } from '@alfira-bot/server/shared';
import {
  CircleNotchIcon,
  ClockIcon,
  DiscIcon,
  HeadphonesIcon,
  MusicNoteIcon,
  PlayIcon,
  TagIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { memo, useState } from 'react';
import { useSongEdit } from '../context/SongEditContext';
import { useSongActions } from '../hooks/useSongActions';
import { ContextMenu, ContextMenuTrigger } from './ContextMenu';
import SongEditPanel from './SongEditPanel';
import TagTicker from './TagTicker';
import { Button } from './ui/Button';

interface MetaInfoProps {
  song: Song;
  isHovered?: boolean;
}

function MetaInfo({ song, isHovered }: MetaInfoProps) {
  const tags = song.tags ?? [];
  return (
    <>
      <span className="flex items-center gap-1.5 font-mono text-xs text-muted">
        {formatDuration(song.duration)}
        <ClockIcon size={11} weight="fill" className="shrink-0" />
      </span>
      {song.volumeBoost != null && song.volumeBoost !== 0 && (
        <span
          className="flex items-center gap-0.5 text-xs"
          style={{ color: song.volumeBoost > 0 ? '#22c55e' : '#eab308' }}
        >
          {song.volumeBoost > 0 ? '+' : ''}
          {song.volumeBoost}%
          <HeadphonesIcon size={11} weight="fill" className="shrink-0" />
        </span>
      )}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted max-w-[20rem] justify-end">
          <TagTicker tags={tags} isHovered={isHovered} />
          <TagIcon size={11} weight="fill" className="shrink-0" />
        </div>
      )}
    </>
  );
}

interface SongRowProps {
  song: Song;
  isAdmin: boolean;
  isAdminView?: boolean;
  playlists?: Playlist[];
  onDelete?: (id: string) => void;
  // When provided, the context menu shows "Remove" (playlist detail context)
  onRemove?: () => void;
  removeLabel?: string;
  onPlay: () => void;
  isPlaying?: boolean;
  onAddToQueue: () => void;
  'data-song-id'?: string;
}

export const SongRow = memo(
  ({
    song,
    isAdmin,
    isAdminView,
    playlists,
    onDelete,
    onRemove,
    removeLabel,
    onPlay,
    isPlaying,
    onAddToQueue,
  }: SongRowProps) => {
    const { openSongId, setOpenSongId } = useSongEdit();
    const [isRowHovered, setIsRowHovered] = useState(false);
    const isOpen = openSongId === song.id;
    const { menuOpen, setMenuOpen, triggerRef, menuItems } = useSongActions({
      song,
      isAdmin,
      playlists: playlists ?? [],
      onAddToQueue,
      ...(onDelete ? { onDelete: () => onDelete(song.id) } : {}),
      onRemove,
      removeLabel,
    });

    return (
      <div
        className={`flex flex-col rounded-lg bg-elevated clay-resting transition-all duration-100${isAdminView ? ' hover:clay-raised hover:-translate-y-px active:clay-flat active:translate-y-0' : ''}`}
        data-song-id={song.id}
        data-song-edit-container
      >
        <div
          className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-3"
          onClick={() => isAdmin && setOpenSongId(isOpen ? null : song.id)}
          onKeyDown={(e) => {
            if (isAdmin && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setOpenSongId(isOpen ? null : song.id);
            }
          }}
          role="button"
          tabIndex={0}
          style={isAdmin ? { cursor: 'pointer' } : undefined}
          onMouseEnter={() => setIsRowHovered(true)}
          onMouseLeave={() => setIsRowHovered(false)}
        >
          <div className="overflow-hidden w-14 h-14 md:w-12 md:h-12 rounded border border-border shrink-0">
            <img
              src={song.artwork ?? song.thumbnailUrl}
              alt={song.nickname || song.title}
              className="w-full h-full object-cover scale-[1.33]"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-px">
            <p
              className={`flex items-center gap-1 truncate${song.nickname ? ' text-xs font-mono text-muted' : ' text-fg font-sm'}`}
            >
              {song.nickname && (
                <MusicNoteIcon size={11} weight="fill" className="shrink-0 text-muted" />
              )}
              <span className="truncate">{song.nickname || song.title}</span>
            </p>
            {song.artist && (
              <p className="flex items-center gap-1 text-xs font-mono text-muted truncate">
                <UserIcon size={11} weight="fill" className="shrink-0 text-muted" />
                <span className="truncate">{song.artist}</span>
              </p>
            )}
            {song.album && (
              <p className="flex items-center gap-1 text-xs font-mono text-muted truncate">
                <DiscIcon size={11} weight="fill" className="shrink-0 text-muted" />
                <span className="truncate">{song.album}</span>
              </p>
            )}
            {(() => {
              const tags = song.tags ?? [];
              return (
                <>
                  <span className="flex items-center gap-1 text-xs text-muted md:hidden">
                    <ClockIcon size={11} weight="fill" className="shrink-0" />
                    {formatDuration(song.duration)}
                  </span>
                  {tags.length > 0 && (
                    <div className="flex items-center gap-1 text-sm text-muted mt-1 md:hidden">
                      <TagIcon size={11} weight="fill" className="shrink-0" />
                      <TagTicker tags={tags} />
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="hidden md:flex flex-col items-end gap-px shrink-0 mr-2">
            <MetaInfo song={song} isHovered={isRowHovered} />
          </div>
          <Button
            variant="primary"
            size="icon"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            disabled={isPlaying}
            className="p-2.5 md:p-1 disabled:opacity-50 disabled:cursor-default"
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
      </div>
    );
  }
);

SongRow.displayName = 'SongRow';

export default SongRow;
