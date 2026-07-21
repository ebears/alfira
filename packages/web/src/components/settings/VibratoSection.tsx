import type React from 'react';

import { ArrowCounterClockwiseIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminView } from '../../context/AdminViewContext';
import { usePermissions } from '../../context/PermissionsContext';
import { Button } from '../ui/Button';

const DEFAULTS = { enabled: false, frequency: 2.0, depth: 0.5 };

const SLIDERS = [
  { key: 'frequency', label: 'Frequency', min: 0.1, max: 14.0, step: 0.1, unit: 'Hz' },
  { key: 'depth', label: 'Depth', min: 0.0, max: 1.0, step: 0.05, unit: '' },
] as const;

type SliderKey = (typeof SLIDERS)[number]['key'];

interface VibratoSliderProps {
  config: (typeof SLIDERS)[number];
  value: number;
  onChange: (key: SliderKey, value: number) => void;
}

const VibratoSlider = memo(function VibratoSlider({
  config: { key, label, min, max, step, unit },
  value,
  onChange,
}: VibratoSliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(key, parseFloat(e.target.value)),
    [onChange, key]
  );

  const rangePct = ((value - min) / (max - min)) * 100;
  const sliderStyle = useMemo(
    () => ({ '--range-pct': `${rangePct}%` }) as React.CSSProperties,
    [rangePct]
  );

  return (
    <div className='flex items-center gap-3'>
      <span className='font-mono text-[11px] text-muted w-20 shrink-0'>{label}</span>
      <span className='font-mono text-[11px] text-fg w-16 shrink-0'>
        {unit ? `${value.toFixed(1)} ${unit}` : value.toFixed(2)}
      </span>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className='flex-1 range-input range-input-h'
        style={sliderStyle}
      />
    </div>
  );
});

interface VibratoValues {
  enabled: boolean;
  frequency: number;
  depth: number;
}

export default function VibratoSection() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');
  const [values, setValues] = useState<VibratoValues>(DEFAULTS);
  const [savedValues, setSavedValues] = useState<VibratoValues>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/vibrato');
        if (res.ok) {
          const data = (await res.json()) as VibratoValues;
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
      const res = await fetch('/api/settings/vibrato', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setSavedValues(values);
      } else {
        // eslint-disable-next-line no-console
        console.error('Failed to save vibrato settings:', res.status);
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

  const handleToggle = useCallback(() => setValues((v) => ({ ...v, enabled: !v.enabled })), []);

  const dimmed = !canManage;

  if (!loaded) {
    return null;
  }

  return (
    <div className={`space-y-3 ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-[11px] text-muted w-20 shrink-0'>Enabled</span>
        <button
          type='button'
          role='switch'
          aria-checked={values.enabled}
          aria-label='Enable vibrato'
          onClick={handleToggle}
          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface ${
            values.enabled ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform bg-elevated ${
              values.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className={`space-y-2 ${!values.enabled ? 'opacity-40' : ''}`}>
        {SLIDERS.map((config) => (
          <VibratoSlider
            key={config.key}
            config={config}
            value={values[config.key]}
            onChange={updateValue}
          />
        ))}
      </div>

      <div className='flex gap-2 pt-1 justify-end'>
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
