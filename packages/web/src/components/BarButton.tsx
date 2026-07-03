import { CircleNotchIcon } from '@phosphor-icons/react';
import type React from 'react';
import { Button } from './ui/Button';

export function BarButton({
  children,
  onClick,
  busy,
  disabled,
  title,
  hoverColor,
  pulse = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  title: string;
  hoverColor: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="inherit"
      surface="base"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${
        busy
          ? 'text-black/50 dark:text-white/50'
          : `${pulse ? 'pressed text-accent' : 'text-black dark:text-white'} ${hoverColor} cursor-pointer`
      } disabled:cursor-not-allowed disabled:opacity-50 md:w-12 md:h-12 ${className}`}
    >
      {busy ? (
        <CircleNotchIcon size={22} weight="bold" className="animate-spin md:w-5 md:h-5" />
      ) : (
        children
      )}
    </Button>
  );
}
