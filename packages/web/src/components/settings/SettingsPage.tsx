import { useEffect, useState } from 'react';
import { fetchVersion } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import AdminTab from './AdminTab';
import AppearanceTab from './AppearanceTab';

export default function SettingsPage() {
  const { user } = useAuth();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetchVersion()
      .then(({ version }) => setVersion(version))
      .catch(() => setVersion(null));
  }, []);

  return (
    <div className="p-4 md:p-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Settings</h1>
      </div>

      {/* User settings */}
      <section className="mb-8">
        <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-4">User</h2>
        <div className="bg-elevated border border-border rounded-xl p-5">
          <AppearanceTab />
        </div>
      </section>

      {/* Admin settings */}
      {user?.isAdmin && (
        <section>
          <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-4">Admin</h2>
          <div className="bg-elevated border border-border rounded-xl p-5">
            <AdminTab />
          </div>
        </section>
      )}

      {/* Version */}
      {version !== null && (
        <div className="mt-8 pt-6 border-t border-border">
          <p className="font-mono text-xs text-faint">{version}</p>
        </div>
      )}
    </div>
  );
}
