import type React from 'react';

import { ArrowCounterClockwiseIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAdminView } from '../../context/AdminViewContext';
import { usePermissions } from '../../context/PermissionsContext';
import { Button } from '../ui/Button';

const DEFAULTS = { enabled: false, threshold: -6, ratio: 4, attack: 5, release: 50, gain: 3 };

const SLIDERS = [
  { key: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, unit: 'dB' },
  { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1' },
  { key: 'attack', label: 'Attack', min: 0, max: 100, step: 1, unit: 'ms' },
  { key: 'release', label: 'Release', min: 10, max: 1000, step: 10, unit: 'ms' },
  { key: 'gain', label: 'Gain', min: 0, max: 24, step: 1, unit: 'dB' },
] as const;

type SliderKey = (typeof SLIDERS)[number]['key'];

// ---------------------------------------------------------------------------
// Child component — extracted for stable onChange + style in the map loop
// ---------------------------------------------------------------------------

interface CompressorSliderProps {
  config: (typeof SLIDERS)[number];
  value: number;
  onChange: (key: SliderKey, value: number) => void;
}

const CompressorSlider = memo(function CompressorSlider({
  config: { key, label, min, max, step, unit },
  value,
  onChange,
}: CompressorSliderProps) {
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
      <span className='text-muted w-20 shrink-0 font-mono text-[11px]'>{label}</span>
      <span className='text-fg w-16 shrink-0 font-mono text-[11px]'>
        {key === 'ratio'
          ? `${value.toFixed(1)}:1`
          : key === 'gain'
            ? `+${value} ${unit}`
            : `${value} ${unit}`}
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

interface CompressorValues {
  enabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
}

interface CompressorSectionProps {
  initialValues?: CompressorValues;
}

export default function CompressorSection({ initialValues }: CompressorSectionProps) {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');
  const [values, setValues] = useState<CompressorValues>(DEFAULTS);
  const [savedValues, setSavedValues] = useState<CompressorValues>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const didInitRef = useRef(false);

  useEffect(() => {
    if (!canManage) {
      setLoaded(true);
      return;
    }
    if (initialValues && !didInitRef.current) {
      setValues(initialValues);
      setSavedValues(initialValues);
      setLoaded(true);
      didInitRef.current = true;
      return;
    }
    if (initialValues) {
      return;
    }
    async function load() {
      try {
        const res = await fetch('/api/settings/compressor');
        if (res.ok) {
          const data = (await res.json()) as CompressorValues;
          setValues(data);
          setSavedValues(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoaded(true);
      }
    }
    void load();
  }, [canManage, initialValues]);

  const hasChanges = JSON.stringify(values) !== JSON.stringify(savedValues);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/compressor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        setSavedValues(values);
      } else {
        console.error('Failed to save compressor settings:', res.status);
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
          aria-label='Enable compressor'
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
          <CompressorSlider
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
