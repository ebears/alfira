import type React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui/Spinner';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className='h-full flex items-center justify-center bg-elevated'>
        <div className='flex flex-col items-center gap-3'>
          <Spinner size='lg' />
          <span className='font-mono text-xs text-muted'>connecting</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to='/login' replace />;

  // During first-run setup, lock all routes except /setup.
  if (user.isSetupAdmin && location.pathname !== '/setup') {
    return <Navigate to='/setup' replace />;
  }

  return <>{children}</>;
}
