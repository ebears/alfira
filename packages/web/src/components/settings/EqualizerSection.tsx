import type React from 'react';

import { ArrowCounterClockwiseIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { useAdminView } from '../../context/AdminViewContext';
import { usePermissions } from '../../context/PermissionsContext';
import { Button } from '../ui/Button';

const FREQ_LABELS = [
  '25',
  '40',
  '63',
  '100',
  '160',
  '250',
  '400',
  '630',
  '1k',
  '1.6k',
  '2.5k',
  '4k',
  '6.3k',
  '10k',
  '16k',
];
const DEFAULT_BANDS = Array(15).fill(50);

// ---------------------------------------------------------------------------
// Child component — extracted for stable onChange + style in the map loop
// ---------------------------------------------------------------------------

interface EqBandSliderProps {
  index: number;
  value: number;
  label: string;
  onChange: (index: number, value: number) => void;
}

const EqBandSlider = memo(function EqBandSlider({
  index,
  value,
  label,
  onChange,
}: EqBandSliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, Number.parseInt(e.target.value, 10));
    },
    [onChange, index]
  );

  const gainOffset = value - 50;
  const gainLabel = gainOffset === 0 ? '0' : `${gainOffset > 0 ? '+' : ''}${gainOffset}`;

  const sliderStyle = useMemo(
    () => ({
      writingMode: 'vertical-lr' as const,
      direction: 'rtl' as const,
      width: '8px',
      height: '120px',
      borderRadius: '4px',
      background: `linear-gradient(to top, var(--color-accent) 0%, var(--color-accent) ${(value / 100) * 100}%, var(--color-border) ${(value / 100) * 100}%, var(--color-border) 100%)`,
    }),
    [value]
  );

  return (
    <div className='flex shrink-0 flex-col items-center gap-1'>
      <span className='text-muted font-mono text-[10px]'>{label}</span>
      <div className='relative h-[120px] w-2'>
        <input
          type='range'
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={handleChange}
          className='range-input'
          style={sliderStyle}
        />
        <div className='bg-border/50 pointer-events-none absolute inset-x-0 top-1/2 h-px' />
      </div>
      <span className='text-fg min-w-[2em] text-right font-mono text-[10px]'>{gainLabel}</span>
    </div>
  );
});

export default function EqualizerSection() {
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();

  const canManage = isAdminView || hasPermission('audio.manage');
  const [bands, setBands] = useState<number[]>(DEFAULT_BANDS);
  const [savedBands, setSavedBands] = useState<number[]>(DEFAULT_BANDS);
  const [eqEnabled, setEqEnabled] = useState(true);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/equalizer');
        if (res.ok) {
          const data = (await res.json()) as { bands: number[]; enabled: boolean };
          setBands(data.bands);
          setSavedBands(data.bands);
          const enabled = data.enabled;
          setEqEnabled(enabled);
          setSavedEnabled(enabled);
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

  // When off, save sends flat bands; when on, save sends real bands
  const effectiveBands = eqEnabled ? bands : DEFAULT_BANDS;
  const hasChanges =
    JSON.stringify(effectiveBands) !== JSON.stringify(savedBands) || eqEnabled !== savedEnabled;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/equalizer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bands: effectiveBands, enabled: eqEnabled }),
      });
      if (res.ok) {
        setSavedBands(effectiveBands);
        setSavedEnabled(eqEnabled);
      } else {
        console.error('Failed to save equalizer settings:', res.status);
      }
    } finally {
      setSaving(false);
    }
  }, [effectiveBands, eqEnabled]);

  const handleReset = useCallback(() => {
    setBands(DEFAULT_BANDS);
  }, []);

  const updateBand = useCallback((index: number, value: number) => {
    setBands((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleToggle = useCallback(() => {
    setEqEnabled((v) => !v);
  }, []);

  // EQ curve SVG visualization
  const curvePath = (() => {
    const W = 280;
    const H = 60;
    const pad = 8;
    const plotH = H - pad * 2;
    const pts = bands.map((v, i) => {
      const x = pad + (i / (bands.length - 1)) * (W - pad * 2);
      const y = pad + plotH - (v / 100) * plotH;
      return `${x},${y}`;
    });
    const centerY = H / 2;
    const fillPts = `${pad},${pad + plotH} ${pts.join(' ')} ${W - pad},${pad + plotH}`;
    return { pts: pts.join(' '), fillPts, centerY, W, H, pad };
  })();

  const dimmed = !canManage;
  const slidersDimmed = !eqEnabled;

  if (!loaded) {
    return null;
  }

  return (
    <div className={`space-y-4 ${dimmed ? 'pointer-events-none opacity-40' : ''}`}>
      {/* Enabled toggle */}
      <div className='flex items-center gap-3'>
        <span className='text-muted w-20 shrink-0 font-mono text-[11px]'>Enabled</span>
        <button
          type='button'
          role='switch'
          aria-checked={eqEnabled}
          aria-label='Enable equalizer'
          onClick={handleToggle}
          className={`focus:ring-accent/50 focus:ring-offset-surface relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none ${
            eqEnabled ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span
            className={`bg-elevated absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform ${
              eqEnabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* EQ curve preview */}
      <svg viewBox={`0 0 ${curvePath.W} ${curvePath.H}`} className='h-14 w-full' aria-hidden='true'>
        <line
          x1={curvePath.pad}
          y1={curvePath.centerY}
          x2={curvePath.W - curvePath.pad}
          y2={curvePath.centerY}
          stroke='var(--color-border)'
          strokeWidth='1'
          strokeDasharray='4 3'
        />
        <polygon points={curvePath.fillPts} fill='var(--color-accent)' opacity='0.07' />
        <polyline
          points={curvePath.pts}
          fill='none'
          stroke='var(--color-accent)'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'
          opacity='0.7'
        />
      </svg>

      {/* Sliders */}
      <div
        className={`flex flex-wrap justify-center gap-2 md:flex-nowrap ${slidersDimmed ? 'opacity-40' : ''}`}
      >
        {bands.map((value, i) => (
          <EqBandSlider
            key={i}
            index={i}
            value={value}
            label={FREQ_LABELS[i]}
            onChange={updateBand}
          />
        ))}
      </div>

      {/* Actions */}
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
