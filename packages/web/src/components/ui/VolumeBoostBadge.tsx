import { HeadphonesIcon } from '@phosphor-icons/react';
import { memo, useMemo } from 'react';

interface VolumeBoostBadgeProps {
  volumeBoost: number | null | undefined;
  className?: string;
}

export const VolumeBoostBadge = memo(function VolumeBoostBadge({
  volumeBoost,
  className = '',
}: VolumeBoostBadgeProps) {
  const isBoost = (volumeBoost ?? 0) > 0;
  const colorStyle = useMemo(() => ({ color: isBoost ? '#22c55e' : '#eab308' }), [isBoost]);

  if (volumeBoost == null || volumeBoost === 0) {
    return null;
  }

  return (
    <span className={`flex items-center gap-0.5 text-xs ${className}`} style={colorStyle}>
      <HeadphonesIcon size={11} weight='fill' className='shrink-0' />
      {isBoost ? '+' : ''}
      {volumeBoost}%
    </span>
  );
});

export default VolumeBoostBadge;
