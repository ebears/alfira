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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/equalizer');
        if (res.ok) {
          const data = (await res.json()) as { bands: number[] };
          setBands(data.bands);
          setSavedBands(data.bands);
        }
      } catch {
        // silently fail
      }
    }
    if (canManage) load();
  }, [canManage]);

  const hasChanges = JSON.stringify(bands) !== JSON.stringify(savedBands);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/equalizer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bands }),
      });
      if (res.ok) {
        setSavedBands(bands);
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

  return (
    <div className={`space-y-3 ${!canManage ? 'opacity-40 pointer-events-none' : ''}`}>
      <h4 className="font-mono text-[11px] text-muted uppercase tracking-wider">Equalizer</h4>
      <div className="flex flex-wrap justify-center gap-2 md:flex-nowrap">
        {bands.map((value, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static UI elements with stable order
          <div key={i} className="flex flex-col items-center gap-1 shrink-0">
            <span className="font-mono text-[10px] text-muted">{FREQ_LABELS[i]}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => updateBand(i, parseInt(e.target.value, 10))}
              className="range-input"
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
            <span className="font-mono text-[10px] text-fg min-w-[2em] text-right">
              {gainDisplay(value)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-1 justify-end">
        <Button variant="primary" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        <Button variant="inherit" surface="elevated" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
