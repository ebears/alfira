import { ArrowCounterClockwise, FloppyDisk } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
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
          const enabled = data.enabled ?? true;
          setEqEnabled(enabled);
          setSavedEnabled(enabled);
        }
      } catch {
        // silently fail
      } finally {
        setLoaded(true);
      }
    }
    if (canManage) load();
    else setLoaded(true);
  }, [canManage]);

  // When off, save sends flat bands; when on, save sends real bands
  const effectiveBands = eqEnabled ? bands : DEFAULT_BANDS;
  const hasChanges =
    JSON.stringify(effectiveBands) !== JSON.stringify(savedBands) || eqEnabled !== savedEnabled;

  async function handleSave() {
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
  }

  function handleReset() {
    setBands(DEFAULT_BANDS);
  }

  function updateBand(index: number, value: number) {
    const next = [...bands];
    next[index] = value;
    setBands(next);
  }

  function gainDisplay(value: number): string {
    const offset = value - 50;
    if (offset === 0) return '0';
    return `${offset > 0 ? '+' : ''}${offset}`;
  }

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

  if (!loaded) return null;

  return (
    <div className={`space-y-4 ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      {/* Enabled toggle */}
      <div className='flex items-center gap-3'>
        <span className='font-mono text-[11px] text-muted w-20 shrink-0'>Enabled</span>
        <button
          type='button'
          role='switch'
          aria-checked={eqEnabled}
          onClick={() => setEqEnabled(!eqEnabled)}
          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface ${
            eqEnabled ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform bg-elevated ${
              eqEnabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* EQ curve preview */}
      <svg viewBox={`0 0 ${curvePath.W} ${curvePath.H}`} className='w-full h-14' aria-hidden='true'>
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
          // biome-ignore lint/suspicious/noArrayIndexKey: static UI elements with stable order
          <div key={i} className='flex flex-col items-center gap-1 shrink-0'>
            <span className='font-mono text-[10px] text-muted'>{FREQ_LABELS[i]}</span>
            <div className='relative h-[120px] w-2'>
              <input
                type='range'
                min={0}
                max={100}
                step={1}
                value={value}
                onChange={(e) => updateBand(i, parseInt(e.target.value, 10))}
                className='range-input'
                style={
                  {
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                    width: '8px',
                    height: '120px',
                    borderRadius: '4px',
                    background: `linear-gradient(to top, var(--color-accent) 0%, var(--color-accent) ${(value / 100) * 100}%, var(--color-border) ${(value / 100) * 100}%, var(--color-border) 100%)`,
                  } as React.CSSProperties
                }
              />
              <div className='absolute inset-x-0 top-1/2 h-px bg-border/50 pointer-events-none' />
            </div>
            <span className='font-mono text-[10px] text-fg min-w-[2em] text-right'>
              {gainDisplay(value)}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
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
