import { ArrowCounterClockwise, FloppyDisk } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { useAdminView } from '../../context/AdminViewContext';
import { usePermissions } from '../../context/PermissionsContext';
import { Button } from '../ui/Button';

const DEFAULTS = { enabled: false, threshold: -6, ratio: 4.0, attack: 5, release: 50, gain: 3 };

const SLIDERS = [
  { key: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, unit: 'dB' },
  { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1' },
  { key: 'attack', label: 'Attack', min: 0, max: 100, step: 1, unit: 'ms' },
  { key: 'release', label: 'Release', min: 10, max: 1000, step: 10, unit: 'ms' },
  { key: 'gain', label: 'Gain', min: 0, max: 24, step: 1, unit: 'dB' },
] as const;

type SliderKey = (typeof SLIDERS)[number]['key'];

interface CompressorValues {
  enabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
}

export default function CompressorSection() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');
  const [values, setValues] = useState<CompressorValues>(DEFAULTS);
  const [savedValues, setSavedValues] = useState<CompressorValues>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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
    if (canManage) {
      void load();
    } else {
      setLoaded(true);
    }
  }, [canManage]);

  const hasChanges = JSON.stringify(values) !== JSON.stringify(savedValues);

  async function handleSave() {
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
  }

  function handleReset() {
    setValues({ ...DEFAULTS, enabled: values.enabled });
  }

  function updateValue(key: SliderKey, value: number) {
    setValues((v) => ({ ...v, [key]: value }));
  }

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
          aria-label='Enable compressor'
          onClick={() => setValues((v) => ({ ...v, enabled: !v.enabled }))}
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
        {SLIDERS.map(({ key, label, min, max, step, unit }) => (
          <div key={key} className='flex items-center gap-3'>
            <span className='font-mono text-[11px] text-muted w-20 shrink-0'>{label}</span>
            <span className='font-mono text-[11px] text-fg w-16 shrink-0'>
              {key === 'ratio'
                ? `${values[key].toFixed(1)}:1`
                : key === 'gain'
                  ? `+${values[key]} ${unit}`
                  : `${values[key]} ${unit}`}
            </span>
            <input
              type='range'
              min={min}
              max={max}
              step={step}
              value={values[key]}
              onChange={(e) => updateValue(key, parseFloat(e.target.value))}
              className='flex-1 range-input range-input-h'
              style={
                {
                  '--range-pct': `${((values[key] - min) / (max - min)) * 100}%`,
                } as React.CSSProperties
              }
            />
          </div>
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
          <FloppyDisk size={16} weight='duotone' />
        </Button>
        <Button
          variant='inherit'
          size='icon'
          surface='elevated'
          onClick={handleReset}
          title='Reset to Defaults'
        >
          <ArrowCounterClockwise size={16} weight='duotone' />
        </Button>
      </div>
    </div>
  );
}
