import { type Playlist } from '@alfira/server/shared';
import { CaretRightIcon, GhostIcon, PlaylistIcon, TagIcon } from '@phosphor-icons/react';
import { memo, useCallback, useMemo } from 'react';

import { ArtworkImage } from './ui/ArtworkImage';
import { Card } from './ui/Card';

interface PlaylistRowProps {
  playlist: Playlist;
  animationDelay: string;
  onClick: (e: React.MouseEvent) => void;
  'data-playlist-id'?: string;
}

/** Fill an array of artwork URLs to exactly 4 slots, repeating as needed. */
function spreadUrls(urls: string[]): (string | null)[] {
  if (urls.length === 0) {
    return [null, null, null, null];
  }
  const result: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    result.push(urls[i % urls.length] ?? null);
  }
  return result;
}

export const PlaylistRow = memo(
  ({ playlist, animationDelay, onClick, 'data-playlist-id': dataPlaylistId }: PlaylistRowProps) => {
    const count = playlist._count?.songs ?? 0;
    const coverUrls = playlist.coverUrls ?? [];
    const cells = spreadUrls(coverUrls);
    const hasArtwork = coverUrls.length > 0;

    const cardStyle = useMemo(() => ({ animationDelay }), [animationDelay]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      },
      [onClick]
    );

    return (
      <Card
        hoverable
        animate
        className='rounded-xl flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5 md:py-4 cursor-pointer group'
        style={cardStyle}
        data-playlist-id={dataPlaylistId}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        role='button'
        tabIndex={0}
      >
        {/* Cover art grid or fallback icon */}
        <div className='w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden clay-flat shrink-0'>
          {hasArtwork ? (
            <div className='grid grid-cols-2 grid-rows-2 w-full h-full'>
              {cells.map((url, i) => (
                // eslint-disable-next-line react/no-array-index-key -- cells are always exactly 4, never reorder
                <div key={i} className='overflow-hidden bg-elevated'>
                  <ArtworkImage src={url ?? undefined} alt='' className='w-full h-full' />
                </div>
              ))}
            </div>
          ) : (
            <div className='w-full h-full bg-elevated flex items-center justify-center'>
              <PlaylistIcon size={32} weight='duotone' className='text-accent' />
            </div>
          )}
        </div>

        {/* Info */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <p className='font-body font-medium text-fg transition-colors duration-150'>
              {playlist.name}
            </p>
            {playlist.isPrivate && (
              <span className='text-muted' title='Private playlist'>
                <GhostIcon size={14} weight='duotone' />
              </span>
            )}
            {playlist.tagNameLower && (
              <span
                className='text-accent'
                title={`Smart playlist — tracks "${playlist.tagNameLower}" tag`}
              >
                <TagIcon size={14} weight='duotone' />
              </span>
            )}
          </div>
          <p className='font-mono text-xs text-muted mt-0.5'>
            {count} {count === 1 ? 'song' : 'songs'}
          </p>
        </div>
        {/* Arrow */}
        <CaretRightIcon
          size={18}
          weight='duotone'
          className='text-faint group-hover:text-muted transition-colors duration-150 md:w-4 md:h-4'
        />
      </Card>
    );
  }
);

PlaylistRow.displayName = 'PlaylistRow';

export default PlaylistRow;
