import CompressorSection from '../components/settings/CompressorSection';
import EqualizerSection from '../components/settings/EqualizerSection';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';

export default function AudioPage() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');

  return (
    <div className="p-4 md:p-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Audio</h1>
        <p className="font-mono text-xs text-muted mt-2">Equalizer and compressor settings</p>
      </div>

      <div className="space-y-2">
        {canManage && <EqualizerSection />}
        {canManage && (
          <>
            <div className="border-t border-muted/20 my-4" />
            <CompressorSection />
          </>
        )}
      </div>
    </div>
  );
}
