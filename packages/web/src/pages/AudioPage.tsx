import {
  ArrowsDownUpIcon,
  BarricadeIcon,
  ChartBarIcon,
  CirclesFourIcon,
  GaugeIcon,
  GuitarIcon,
  MicrophoneStageIcon,
  SlidersHorizontalIcon,
  WaveSineIcon,
  WavesIcon,
} from '@phosphor-icons/react';

import ChannelMixSection from '../components/settings/ChannelMixSection';
import CompressorSection from '../components/settings/CompressorSection';
import DistortionSection from '../components/settings/DistortionSection';
import EqualizerSection from '../components/settings/EqualizerSection';
import KaraokeSection from '../components/settings/KaraokeSection';
import LowPassSection from '../components/settings/LowPassSection';
import RotationSection from '../components/settings/RotationSection';
import TimescaleSection from '../components/settings/TimescaleSection';
import TremoloSection from '../components/settings/TremoloSection';
import VibratoSection from '../components/settings/VibratoSection';
import { PageHeader } from '../components/ui/PageHeader';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';

const FILTER_CARDS = [
  { icon: SlidersHorizontalIcon, label: 'Equalizer', component: EqualizerSection, wide: true },
  { icon: ArrowsDownUpIcon, label: 'Compressor', component: CompressorSection, wide: true },
  { icon: MicrophoneStageIcon, label: 'Karaoke', component: KaraokeSection, wide: true },
  { icon: GaugeIcon, label: 'Timescale', component: TimescaleSection },
  { icon: WaveSineIcon, label: 'Tremolo', component: TremoloSection },
  { icon: WavesIcon, label: 'Vibrato', component: VibratoSection },
  { icon: CirclesFourIcon, label: 'Rotation', component: RotationSection },
  { icon: GuitarIcon, label: 'Distortion', component: DistortionSection, wide: true },
  { icon: ChartBarIcon, label: 'Channel Mix', component: ChannelMixSection, wide: true },
  { icon: BarricadeIcon, label: 'Low Pass', component: LowPassSection },
];

export default function AudioPage() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');

  return (
    <div className='p-4 md:p-8 h-full overflow-y-auto'>
      <PageHeader
        icon={SlidersHorizontalIcon}
        title='Audio'
        subtitle='Equalizer, compressor, and audio effects'
      />

      {!canManage ? (
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <p className='text-sm text-muted mb-1'>No access to audio settings</p>
          <p className='text-xs text-muted'>
            You need the <span className='text-fg font-medium'>audio.manage</span> permission or an
            admin role to manage audio settings.
          </p>
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'>
          {FILTER_CARDS.map(({ icon: Icon, label, component: Section, wide }) => (
            <section key={label} className={wide ? 'xl:col-span-2' : ''}>
              <h2 className='font-mono text-xs text-muted uppercase tracking-wider mb-3 flex items-center gap-2'>
                <Icon size={14} weight='duotone' />
                {label}
              </h2>
              <div className='bg-elevated clay-resting rounded-lg p-5'>
                <Section />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
