import CompressorSection from '../components/settings/CompressorSection';
import EqualizerSection from '../components/settings/EqualizerSection';
import { useAdminView } from '../context/AdminViewContext';

export default function AudioPage() {
  const { isAdminView } = useAdminView();

  return (
    <div className="p-4 md:p-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Audio</h1>
      </div>

      <div className="space-y-2">
        {isAdminView && <EqualizerSection />}
        {isAdminView && (
          <>
            <div className="border-t border-muted/20 my-4" />
            <CompressorSection />
          </>
        )}
      </div>
    </div>
  );
}
