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
    fetchVersion()
      .then(({ version }) => setVersion(version))
      .catch(() => setVersion(null));
  }, []);

  return (
    <div className='p-4 md:p-8 h-full overflow-y-auto pb-24 md:pb-20'>
      {/* Page header */}
      <div className='mb-6 md:mb-8 flex items-end justify-between'>
        <h1 className='font-display text-3xl md:text-4xl text-accent tracking-wider flex items-center gap-2'>
          <WrenchIcon size={28} weight='duotone' className='shrink-0 relative top-1' />
          Settings
        </h1>
        {version !== null && <p className='font-mono text-xs text-faint pb-1'>{version}</p>}
      </div>

      {/* User settings */}
      <section className='mb-8'>
        <h2 className='font-mono text-xs text-muted uppercase tracking-wider mb-4'>User</h2>
        <div className='bg-elevated clay-resting rounded-lg p-5'>
          <UserSection />
        </div>
      </section>

      {/* Admin settings */}
      {user?.isAdmin && (
        <section>
          <h2 className='font-mono text-xs text-muted uppercase tracking-wider mb-4'>Admin</h2>
          <div className='bg-elevated clay-resting rounded-lg p-5'>
            <AdminSection />
          </div>
        </section>
      )}
    </div>
  );
}
