import { memo } from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-3 h-3 border',
  md: 'w-4 h-4 border-2',
  lg: 'w-8 h-8 border-2',
};

export const Spinner = memo(function Spinner({ size = 'sm' }: SpinnerProps) {
  return (
    <span
      className={`${sizeClasses[size]} border-accent inline-block animate-spin rounded-full border-t-transparent`}
    />
  );
});
