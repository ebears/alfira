import { memo } from 'react';

interface ErrorBannerProps {
  message: string;
  className?: string;
}

export const ErrorBanner = memo(function ErrorBanner({ message, className }: ErrorBannerProps) {
  return (
    <div
      className={`bg-danger/10 border-danger/20 text-danger rounded-lg border p-3 text-sm${className ? ` ${className}` : ''}`}
    >
      {message}
    </div>
  );
});
