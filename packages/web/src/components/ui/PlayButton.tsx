import { CircleNotchIcon, PlayIcon } from '@phosphor-icons/react';
import { memo } from 'react';
import { Button } from './Button';

interface PlayButtonProps {
  onClick: () => void;
  isPlaying: boolean;
  className?: string;
  title?: string;
}

export const PlayButton = memo(function PlayButton({
  onClick,
  isPlaying,
  className = '',
  title = 'Play from this song',
}: PlayButtonProps) {
  return (
    <Button
      variant='primary'
      size='icon'
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={isPlaying}
      className={`shrink-0 disabled:cursor-default ${className}`}
      title={title}
    >
      {isPlaying ? (
        <CircleNotchIcon size={22} weight='bold' className='animate-spin' />
      ) : (
        <PlayIcon size={22} weight='duotone' />
      )}
    </Button>
  );
});

export default PlayButton;
