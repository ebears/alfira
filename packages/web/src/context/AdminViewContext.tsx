import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'alfira-admin-view';

interface AdminViewContextValue {
  isAdminView: boolean;
  toggleAdminView: () => void;
}

const AdminViewContext = createContext<AdminViewContextValue | null>(null);

export function AdminViewProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [adminViewOn, setAdminViewOn] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return true;
  });

  // Persist to localStorage when adminViewOn changes
  useEffect(() => {
    if (user?.isAdmin) {
      localStorage.setItem(STORAGE_KEY, String(adminViewOn));
    }
  }, [adminViewOn, user?.isAdmin]);

  // isAdminView is only true when the user IS an admin AND the toggle is on.
  // Non-admin users always get false, regardless of the toggle state.
  const isAdminView = (user?.isAdmin ?? false) && adminViewOn;

  const toggleAdminView = useCallback(() => {
    if (user?.isAdmin) {
      setAdminViewOn((v) => !v);
    }
  }, [user?.isAdmin]);

  return (
    <AdminViewContext
      value={useMemo(() => ({ isAdminView, toggleAdminView }), [isAdminView, toggleAdminView])}
    >
      {children}
    </AdminViewContext>
  );
}

export function useAdminView(): AdminViewContextValue {
  const ctx = useContext(AdminViewContext);
  if (!ctx) throw new Error('useAdminView must be used inside AdminViewProvider');
  return ctx;
}
