import type React from 'react';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface QueuePanelContextValue {
  queueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
}

const QueuePanelContext = createContext<QueuePanelContextValue | null>(null);

export function QueuePanelProvider({ children }: { children: React.ReactNode }) {
  const [queueOpen, setQueueOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('alfira-queue-open');
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('alfira-queue-open', String(queueOpen));
  }, [queueOpen]);

  return (
    <QueuePanelContext value={useMemo(() => ({ queueOpen, setQueueOpen }), [queueOpen])}>
      {children}
    </QueuePanelContext>
  );
}

export function useQueuePanel(): QueuePanelContextValue {
  const ctx = useContext(QueuePanelContext);
  if (!ctx) {
    throw new Error('useQueuePanel must be used inside QueuePanelProvider');
  }
  return ctx;
}
