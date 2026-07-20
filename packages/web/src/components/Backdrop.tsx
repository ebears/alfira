import type React from 'react';

import { useCallback } from 'react';

export function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className='fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 cursor-default'
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      role='presentation'
    >
      {children}
    </div>
  );
}
