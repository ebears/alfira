import { CircleNotchIcon, PlayIcon } from '@phosphor-icons/react';
import { memo, useMemo } from 'react';

import { useCooldownGuard } from '../../hooks/useCooldownGuard';
import { Button } from './Button';
import { cooldownButtonProps } from './cooldownButtonProps';

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

  const cooldown = useMemo(
    () => ({ coolingDown, statusTitle, onCooldownClick: handleCooldownClick }),
    [coolingDown, statusTitle, handleCooldownClick]
  );

  return (
    <Button
      variant='primary'
      size='icon'
      {...cooldownButtonProps(cooldown, { onClick, disabled: isPlaying, title })}
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
      className={`shrink-0 disabled:cursor-default ${className}`}
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
