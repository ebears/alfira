import { useEffect, useState } from 'react';
import { useAdminView } from '../../context/AdminViewContext';
import { usePermissions } from '../../context/PermissionsContext';
import SettingsToggle from './SettingsToggle';

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
      }
    }
    if (canManage) load();
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

  return (
    <div className={`space-y-3 ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-[11px] text-muted uppercase tracking-wider">Compressor</h4>
        <SettingsToggle
          label=""
          checked={values.enabled}
          onChange={(enabled) => setValues((v) => ({ ...v, enabled }))}
        />
      </div>

      <div className="space-y-2">
        {SLIDERS.map(({ key, label, min, max, step, unit }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-muted w-20 shrink-0">{label}</span>
            <span className="font-mono text-[11px] text-fg w-16 shrink-0">
              {key === 'ratio'
                ? `${values[key].toFixed(1)}:1`
                : key === 'gain'
                  ? `+${values[key]} ${unit}`
                  : `${values[key]} ${unit}`}
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={values[key]}
              onChange={(e) => updateValue(key, parseFloat(e.target.value))}
              className="flex-1 range-input range-input-h"
              style={
                {
                  ['--range-pct' as string]: `${((values[key] - min) / (max - min)) * 100}%`,
                } as React.CSSProperties
              }
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-1 justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`font-body text-sm px-4 py-1.5 rounded transition-colors ${
            hasChanges && !saving
              ? 'bg-accent text-elevated cursor-pointer'
              : 'bg-elevated text-muted cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="font-body text-sm px-4 py-1.5 rounded bg-elevated text-muted hover:text-fg transition-colors cursor-pointer"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
