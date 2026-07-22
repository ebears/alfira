import { WrenchIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { fetchVersion } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import AdminSection from './AdminSection';
import UserSection from './UserSection';

export default function SettingsPage() {
  const { user } = useAuth();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { version } = await fetchVersion();
        setVersion(version);
      } catch {
        setVersion(null);
      }
    })();
  }, []);

  return (
    <div className='h-full overflow-y-auto p-4 md:p-8'>
      {/* Page header */}
      <div className='mb-6 flex items-end justify-between md:mb-8'>
        <h1 className='font-display text-accent flex items-center gap-2 text-3xl tracking-wider md:text-4xl'>
          <WrenchIcon size={28} weight='duotone' className='relative top-1 shrink-0' />
          Settings
        </h1>
        {version !== null && <p className='text-faint pb-1 font-mono text-xs'>{version}</p>}
      </div>

      {/* User settings */}
      <section className='mb-8'>
        <h2 className='text-muted mb-4 font-mono text-xs tracking-wider uppercase'>User</h2>
        <div className='bg-elevated clay-resting rounded-lg p-5'>
          <UserSection />
        </div>
      </section>

      {/* Admin settings */}
      {user?.isAdmin && (
        <section>
          <h2 className='text-muted mb-4 font-mono text-xs tracking-wider uppercase'>Admin</h2>
          <div className='bg-elevated clay-resting rounded-lg p-5'>
            <AdminSection />
          </div>
        </section>
      )}
    </div>
  );
}
