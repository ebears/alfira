import { type FiltersData } from '@alfira/server/shared';
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
import { type Icon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

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
import { Spinner } from '../components/ui/Spinner';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';

interface FilterCardDef {
  icon: Icon;
  label: string;
  wide?: boolean;
}

function FilterCard({
  icon: IconEl,
  label,
  wide,
  children,
}: FilterCardDef & { children: React.ReactNode }) {
  return (
    <section className={wide ? 'xl:col-span-2' : ''}>
      <h2 className='text-muted mb-3 flex items-center gap-2 font-mono text-xs tracking-wider uppercase'>
        <IconEl size={14} weight='duotone' />
        {label}
      </h2>
      <div className='bg-elevated clay-resting rounded-lg p-5'>{children}</div>
    </section>
  );
}

export default function AudioPage() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');
  const [filters, setFilters] = useState<FiltersData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canManage) {
      setLoaded(true);
      return;
    }
    async function load() {
      try {
        const res = await fetch('/api/settings/filters');
        if (res.ok) {
          setFilters((await res.json()) as FiltersData);
        }
      } catch {
        // silently fail — sections will fall back to individual fetches
      } finally {
        setLoaded(true);
      }
    }
    void load();
  }, [canManage]);

  if (!loaded) {
    return (
      <div className='flex h-full items-center justify-center p-4 md:p-8'>
        <Spinner />
      </div>
    );
  }

  return (
    <div className='h-full overflow-y-auto p-4 md:p-8'>
      <PageHeader
        icon={SlidersHorizontalIcon}
        title='Audio'
        subtitle='Equalizer, compressor, and audio effects'
      />

      {!canManage ? (
        <div className='flex flex-col items-center justify-center py-20 text-center'>
          <p className='text-muted mb-1 text-sm'>No access to audio settings</p>
          <p className='text-muted text-xs'>
            You need the <span className='text-fg font-medium'>audio.manage</span> permission or an
            admin role to manage audio settings.
          </p>
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3'>
          <FilterCard icon={SlidersHorizontalIcon} label='Equalizer' wide>
            <EqualizerSection initialValues={filters?.equalizer} />
          </FilterCard>
          <FilterCard icon={ArrowsDownUpIcon} label='Compressor' wide>
            <CompressorSection initialValues={filters?.compressor} />
          </FilterCard>
          <FilterCard icon={MicrophoneStageIcon} label='Karaoke' wide>
            <KaraokeSection initialValues={filters?.karaoke} />
          </FilterCard>
          <FilterCard icon={GaugeIcon} label='Timescale'>
            <TimescaleSection initialValues={filters?.timescale} />
          </FilterCard>
          <FilterCard icon={WaveSineIcon} label='Tremolo'>
            <TremoloSection initialValues={filters?.tremolo} />
          </FilterCard>
          <FilterCard icon={WavesIcon} label='Vibrato'>
            <VibratoSection initialValues={filters?.vibrato} />
          </FilterCard>
          <FilterCard icon={CirclesFourIcon} label='Rotation'>
            <RotationSection initialValues={filters?.rotation} />
          </FilterCard>
          <FilterCard icon={GuitarIcon} label='Distortion' wide>
            <DistortionSection initialValues={filters?.distortion} />
          </FilterCard>
          <FilterCard icon={ChartBarIcon} label='Channel Mix' wide>
            <ChannelMixSection initialValues={filters?.channelMix} />
          </FilterCard>
          <FilterCard icon={BarricadeIcon} label='Low Pass'>
            <LowPassSection initialValues={filters?.lowPass} />
          </FilterCard>
        </div>
      )}
    </div>
  );
}
