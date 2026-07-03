import type { Playlist } from '@alfira-bot/server/shared';
import { CaretRightIcon, GhostIcon, PlaylistIcon, TagIcon } from '@phosphor-icons/react';
import { memo } from 'react';
import { Card } from './ui/Card';

interface PlaylistRowProps {
  playlist: Playlist;
  animationDelay: string;
  onClick: (e: React.MouseEvent) => void;
  'data-playlist-id'?: string;
}

export const PlaylistRow = memo(
  ({ playlist, animationDelay, onClick, 'data-playlist-id': dataPlaylistId }: PlaylistRowProps) => {
    const count = playlist._count?.songs ?? 0;
    return (
      <Card
        hoverable
        animate
        className="rounded-xl flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5 md:py-4 cursor-pointer group"
        style={{ animationDelay }}
        data-playlist-id={dataPlaylistId}
        onClick={onClick}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as unknown as React.MouseEvent);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Icon */}
        <div className="w-11 h-11 md:w-10 md:h-10 rounded-xl bg-accent/10 border border-accent/20 shrink-0 flex items-center justify-center">
          <PlaylistIcon size={18} weight="duotone" className="text-accent md:w-4 md:h-4" />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-body font-medium text-fg transition-colors duration-150">
              {playlist.name}
            </p>
            {playlist.isPrivate && (
              <span className="text-muted" title="Private playlist">
                <GhostIcon size={14} weight="duotone" />
              </span>
            )}
            {playlist.tagNameLower && (
              <span
                className="text-accent"
                title={`Smart playlist — tracks "${playlist.tagNameLower}" tag`}
              >
                <TagIcon size={14} weight="duotone" />
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-muted mt-0.5">
            {count} {count === 1 ? 'song' : 'songs'}
          </p>
        </div>
        {/* Arrow */}
        <CaretRightIcon
          size={18}
          weight="duotone"
          className="text-faint group-hover:text-muted transition-colors duration-150 md:w-4 md:h-4"
        />
      </Card>
    );
  }
);

PlaylistRow.displayName = 'PlaylistRow';

export default PlaylistRow;
