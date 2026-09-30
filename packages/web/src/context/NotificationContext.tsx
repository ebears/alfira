import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Notification Context
//
// Provides a global notification state that can be shared across components.
// This solves the issue where multiple useNotification() calls would create
// separate state instances, causing notifications to not appear when triggered
// from nested hooks.
// ---------------------------------------------------------------------------

export interface Notification {
  message: string;
  type: 'success' | 'error';
}

type NotifyFn = (message: string, type: 'success' | 'error', ms?: number) => void;

interface NotificationContextValue {
  notification: Notification | null;
  notify: NotifyFn;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const notify = useCallback((message: string, type: 'success' | 'error', ms = 3000) => {
    // Clear any existing timeout to prevent race conditions
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setNotification({ message, type });

    timeoutRef.current = setTimeout(() => {
      setNotification(null);
      timeoutRef.current = null;
    }, ms);
  }, []);

  return (
    <NotificationContext value={useMemo(() => ({ notification, notify }), [notification, notify])}>
      {children}
    </NotificationContext>
  );
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
