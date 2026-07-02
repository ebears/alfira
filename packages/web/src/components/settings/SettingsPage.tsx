import { useEffect, useState } from 'react';
import { fetchVersion } from '../../api/api';
import AppearanceTab from './AppearanceTab';
import ServerTab from './ServerTab';
import SettingsTabs from './SettingsTabs';
import TagsTab from './TagsTab';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('appearance');
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetchVersion()
      .then(({ version }) => setVersion(version))
      .catch(() => setVersion(null));
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'appearance':
        return <AppearanceTab />;
      case 'audio':
        return <ServerTab />;
      case 'tags':
        return <TagsTab />;
      default:
        return <AppearanceTab />;
    }
  };

  return (
    <div className="p-4 md:p-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Settings</h1>
      </div>

      {/* Tabs */}
      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content */}
      <div className="mt-6">{renderTab()}</div>

      {/* Version */}
      {version !== null && (
        <div className="mt-8 pt-6 border-t border-border">
          <p className="font-mono text-xs text-faint">{version}</p>
        </div>
      )}
    </div>
  );
}
