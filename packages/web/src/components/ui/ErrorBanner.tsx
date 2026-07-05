import { memo } from 'react';

interface ErrorBannerProps {
  message: string;
  className?: string;
}

export const ErrorBanner = memo(function ErrorBanner({ message, className }: ErrorBannerProps) {
  return (
    <div
      className={`p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm${className ? ` ${className}` : ''}`}
    >
      {message}
    </div>
  );
});
