import { type ChannelMixSettings, DEFAULT_CHANNEL_MIX } from '@alfira/server/shared';
import { ArrowCounterClockwiseIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { memo, useCallback, useMemo, useState } from 'react';

import { useAdminView } from '../../context/AdminViewContext';
import { usePermissions } from '../../context/PermissionsContext';
import { useFilterSection } from '../../hooks/useFilterSection';
import { Button } from '../ui/Button';

const DEFAULTS: ChannelMixSettings = { ...DEFAULT_CHANNEL_MIX };

const SLIDERS = [
  { key: 'leftToLeft', label: 'L → L', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'leftToRight', label: 'L → R', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'rightToLeft', label: 'R → L', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'rightToRight', label: 'R → R', min: 0, max: 1, step: 0.05, unit: '' },
] as const;

type SliderKey = (typeof SLIDERS)[number]['key'];

interface ChannelMixSliderProps {
  config: (typeof SLIDERS)[number];
  value: number;
  onChange: (key: SliderKey, value: number) => void;
}

const ChannelMixSlider = memo(function ChannelMixSlider({
  config: { key, label, min, max, step },
  value,
  onChange,
}: ChannelMixSliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(key, Number(e.target.value));
    },
    [onChange, key]
  );

  const rangePct = ((value - min) / (max - min)) * 100;
  const sliderStyle = useMemo(
    () => ({ '--range-pct': `${rangePct}%` }) as React.CSSProperties,
    [rangePct]
  );

  return (
    <div className='flex items-center gap-3'>
      <span className='text-muted w-16 shrink-0 font-mono text-[11px]'>{label}</span>
      <span className='text-fg w-12 shrink-0 font-mono text-[11px]'>{value.toFixed(2)}</span>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className='range-input range-input-h flex-1'
        style={sliderStyle}
      />
    </div>
  );
});

interface ChannelMixSectionProps {
  initialValues?: ChannelMixSettings;
}

export default function ChannelMixSection({ initialValues }: ChannelMixSectionProps) {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');
  const [values, setValues] = useState<ChannelMixSettings>(DEFAULTS);
  const [savedValues, setSavedValues] = useState<ChannelMixSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const loaded = useFilterSection(
    canManage,
    '/api/settings/channelmix',
    initialValues,
    setValues,
    setSavedValues
  );

  const hasChanges = JSON.stringify(values) !== JSON.stringify(savedValues);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/channelmix', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setSavedValues(values);
      } else {
        // eslint-disable-next-line no-console
        console.error('Failed to save channel mix settings:', res.status);
      }
    } finally {
      setSaving(false);
    }
  }, [values]);

  const handleReset = useCallback(() => {
    setValues({ ...DEFAULTS, enabled: values.enabled });
  }, [values.enabled]);

  const updateValue = useCallback((key: SliderKey, value: number) => {
    setValues((v) => ({ ...v, [key]: value }));
  }, []);

  const handleToggle = useCallback(() => {
    setValues((v) => ({ ...v, enabled: !v.enabled }));
  }, []);

  const dimmed = !canManage;

  if (!loaded) {
    return null;
  }

  return (
    <div className={`space-y-3 ${dimmed ? 'pointer-events-none opacity-40' : ''}`}>
      <div className='flex items-center gap-3'>
        <span className='text-muted w-20 shrink-0 font-mono text-[11px]'>Enabled</span>
        <button
          type='button'
          role='switch'
          aria-checked={values.enabled}
          aria-label='Enable channel mix'
          onClick={handleToggle}
          className={`focus:ring-accent/50 focus:ring-offset-surface relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none ${
            values.enabled ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span
            className={`bg-elevated absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform ${
              values.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className={`space-y-2 ${!values.enabled ? 'opacity-40' : ''}`}>
        {SLIDERS.map((config) => (
          <ChannelMixSlider
            key={config.key}
            config={config}
            value={values[config.key]}
            onChange={updateValue}
          />
        ))}
      </div>

      <div className='flex justify-end gap-2 pt-1'>
        <Button
          variant='primary'
          size='icon'
          onClick={handleSave}
          disabled={!hasChanges || saving}
          title={saving ? 'Saving…' : 'Save Changes'}
        >
          <FloppyDiskIcon size={16} weight='duotone' />
        </Button>
        <Button
          variant='inherit'
          size='icon'
          surface='elevated'
          onClick={handleReset}
          title='Reset to Defaults'
        >
          <ArrowCounterClockwiseIcon size={16} weight='duotone' />
        </Button>
      </div>
    </div>
  );
}
