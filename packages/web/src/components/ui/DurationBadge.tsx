import { formatDuration } from '@alfira-bot/server/shared';
import { ClockIcon } from '@phosphor-icons/react';
import { memo } from 'react';

interface DurationBadgeProps {
  seconds: number;
  /** 'overlay' = dark badge for thumbnail overlays; 'inline' = light text with clock icon */
  variant?: 'overlay' | 'inline';
  className?: string;
}

export const DurationBadge = memo(function DurationBadge({
  seconds,
  variant = 'inline',
  className = '',
}: DurationBadgeProps) {
  if (variant === 'overlay') {
    return (
      <span
        className={`font-mono text-[10px] text-white/80 bg-black/50 px-1.5 py-0.5 rounded ${className}`}
      >
        {formatDuration(seconds)}
      </span>
    );
  }

  return (
    <span className={`flex items-center gap-1.5 font-mono text-xs text-muted ${className}`}>
      <ClockIcon size={11} weight='fill' className='shrink-0' />
      {formatDuration(seconds)}
    </span>
  );
});

export default DurationBadge;
