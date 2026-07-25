import type React from 'react';

import { ArrowCounterClockwiseIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminView } from '../../context/AdminViewContext';
import { usePermissions } from '../../context/PermissionsContext';
import { Button } from '../ui/Button';

const DEFAULTS = {
  enabled: false,
  level: 1,
  monoLevel: 1,
  filterBand: 220,
  filterWidth: 100,
};

const SLIDERS = [
  { key: 'level', label: 'Level', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'monoLevel', label: 'Mono Level', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'filterBand', label: 'Filter Band', min: 50, max: 10000, step: 10, unit: 'Hz' },
  { key: 'filterWidth', label: 'Filter Width', min: 10, max: 10000, step: 10, unit: 'Hz' },
] as const;

type SliderKey = (typeof SLIDERS)[number]['key'];

interface KaraokeSliderProps {
  config: (typeof SLIDERS)[number];
  value: number;
  onChange: (key: SliderKey, value: number) => void;
}

const KaraokeSlider = memo(function KaraokeSlider({
  config: { key, label, min, max, step, unit },
  value,
  onChange,
}: KaraokeSliderProps) {
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
      <span className='text-muted w-24 shrink-0 font-mono text-[11px]'>{label}</span>
      <span className='text-fg w-20 shrink-0 font-mono text-[11px]'>
        {unit ? `${value.toFixed(2)} ${unit}` : value.toFixed(2)}
      </span>
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

interface KaraokeValues {
  enabled: boolean;
  level: number;
  monoLevel: number;
  filterBand: number;
  filterWidth: number;
}

export default function KaraokeSection() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');
  const [values, setValues] = useState<KaraokeValues>(DEFAULTS);
  const [savedValues, setSavedValues] = useState<KaraokeValues>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/karaoke');
        if (res.ok) {
          const data = (await res.json()) as KaraokeValues;
          setValues(data);
          setSavedValues(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoaded(true);
      }
    }
    if (canManage) {
      void load();
    } else {
      setLoaded(true);
    }
  }, [canManage]);

  const hasChanges = JSON.stringify(values) !== JSON.stringify(savedValues);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/karaoke', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setSavedValues(values);
      } else {
        // eslint-disable-next-line no-console
        console.error('Failed to save karaoke settings:', res.status);
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
          aria-label='Enable karaoke'
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
          <KaraokeSlider
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
