import { ArrowsDownUp, SlidersHorizontal } from '@phosphor-icons/react';
import CompressorSection from '../components/settings/CompressorSection';
import EqualizerSection from '../components/settings/EqualizerSection';
import { PageHeader } from '../components/ui/PageHeader';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';

export default function AudioPage() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');

  return (
    <div className='p-4 md:p-8'>
      <PageHeader
        icon={SlidersHorizontal}
        title='Audio'
        subtitle='Equalizer and compressor settings'
      />

      {!canManage ? (
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <p className='text-sm text-muted mb-1'>No access to audio settings</p>
          <p className='text-xs text-muted'>
            You need the <span className='text-fg font-medium'>audio.manage</span> permission or an
            admin role to manage equalizer and compressor settings.
          </p>
        </div>
      ) : (
        <div className='lg:grid lg:grid-cols-2 lg:gap-8'>
          {/* Equalizer */}
          <section className='mb-8 lg:mb-0'>
            <h2 className='font-mono text-xs text-muted uppercase tracking-wider mb-4 flex items-center gap-2'>
              <SlidersHorizontal size={14} weight='duotone' />
              Equalizer
            </h2>
            <div className='bg-elevated clay-resting rounded-lg p-5'>
              <EqualizerSection />
            </div>
          </section>

          {/* Compressor */}
          <section>
            <h2 className='font-mono text-xs text-muted uppercase tracking-wider mb-4 flex items-center gap-2'>
              <ArrowsDownUp size={14} weight='duotone' />
              Compressor
            </h2>
            <div className='bg-elevated clay-resting rounded-lg p-5'>
              <CompressorSection />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
