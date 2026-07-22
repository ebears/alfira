import { formatDuration } from '@alfira/server/shared';
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
        className={`rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white/80 ${className}`}
      >
        {formatDuration(seconds)}
      </span>
    );
  }

  return (
    <span className={`text-muted flex items-center gap-1.5 font-mono text-xs ${className}`}>
      <ClockIcon size={11} weight='fill' className='shrink-0' />
      {formatDuration(seconds)}
    </span>
  );
});

export default DurationBadge;
