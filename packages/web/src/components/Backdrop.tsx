import type React from 'react';

export function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className='fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 cursor-default'
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
      role='presentation'
    >
      {children}
    </div>
  );
}
