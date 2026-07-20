import { type User } from '@alfira/server/shared';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getMe, logout as logoutApi } from '../api/api';
import { trySilentRefresh } from '../api/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isAuthChecking = useRef(false);

  const refetch = useCallback(async () => {
    if (isAuthChecking.current) {
      return;
    }
    isAuthChecking.current = true;

    try {
      const me = await getMe();
      setUser(me);
    } catch (err) {
      // First attempt failed (network error, expired token, etc.).
      // trySilentRefresh refreshes the token. If it succeeds, retry getMe
      // once. wrappedFetch handles any further 401s transparently.
      console.warn('[auth] AuthContext: initial getMe() failed, trying silent refresh', err);
      const refreshed = await trySilentRefresh();
      if (refreshed) {
        try {
          const me = await getMe();
          setUser(me);
        } catch (err2) {
          console.warn(
            '[auth] AuthContext: getMe() failed after successful refresh, setting user=null',
            err2
          );
          setUser(null);
        }
      } else {
        console.warn('[auth] AuthContext: trySilentRefresh() returned false, setting user=null');
        setUser(null);
      }
    } finally {
      setLoading(false);
      isAuthChecking.current = false;
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
  }, []);

  return (
    <AuthContext
      value={useMemo(() => ({ user, loading, logout, refetch }), [user, loading, logout, refetch])}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
