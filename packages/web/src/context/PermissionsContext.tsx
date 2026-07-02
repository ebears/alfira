import type { PermissionAction } from '@alfira-bot/server/shared';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMyPermissions } from '../api/api';
import { useAuth } from './AuthContext';

interface PermissionsContextValue {
  permissions: Set<string>;
  hasPermission: (action: PermissionAction) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) {
      setPermissions(new Set());
      return;
    }

    try {
      const result = await fetchMyPermissions();
      setPermissions(new Set(result.permissions));
    } catch {
      // Silently ignore — the user just won't have any permissions.
      setPermissions(new Set());
    }
  }, [user]);

  // Fetch on mount and when user changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch on tab focus so permission changes take effect without re-login
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const hasPermission = useCallback(
    (action: PermissionAction): boolean => {
      return permissions.has(action);
    },
    [permissions]
  );

  return (
    <PermissionsContext
      value={useMemo(
        () => ({ permissions, hasPermission, refresh }),
        [permissions, hasPermission, refresh]
      )}
    >
      {children}
    </PermissionsContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside PermissionsProvider');
  return ctx;
}
