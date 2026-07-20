import { HeadphonesIcon } from '@phosphor-icons/react';
import { memo } from 'react';

interface VolumeBoostBadgeProps {
  volumeBoost: number | null | undefined;
  className?: string;
}

export const VolumeBoostBadge = memo(function VolumeBoostBadge({
  volumeBoost,
  className = '',
}: VolumeBoostBadgeProps) {
  if (volumeBoost == null || volumeBoost === 0) {
    return null;
  }

  const isBoost = volumeBoost > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs ${className}`}
      style={{ color: isBoost ? '#22c55e' : '#eab308' }}
    >
      <HeadphonesIcon size={11} weight='fill' className='shrink-0' />
      {isBoost ? '+' : ''}
      {volumeBoost}%
    </span>
  );
});

export default VolumeBoostBadge;
