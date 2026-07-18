import { CircleNotchIcon, PlayIcon } from '@phosphor-icons/react';
import { memo } from 'react';
import { useCooldownGuard } from '../../hooks/useCooldownGuard';
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
  const { coolingDown, statusTitle, handleCooldownClick } = useCooldownGuard();

  const effectiveTitle = statusTitle ?? title;

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
        if (coolingDown) {
          handleCooldownClick();
        } else {
          onClick();
        }
      }}
      disabled={isPlaying && !coolingDown}
      dimmed={coolingDown}
      className={`shrink-0 disabled:cursor-default ${className}`}
      title={effectiveTitle}
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
