import { useCallback } from 'react';

interface SettingsToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: SettingsToggleProps) {
  const handleClick = useCallback(() => {
    if (!disabled) {
      onChange(!checked);
    }
  }, [disabled, onChange, checked]);

  return (
    <div className={`flex items-start gap-4 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
      <div className='min-w-0 flex-1'>
        <p className='font-body text-fg text-sm font-medium'>{label}</p>
        {description && <p className='text-muted mt-0.5 font-mono text-[11px]'>{description}</p>}
      </div>
      <button
        type='button'
        role='switch'
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        className={`focus:ring-accent/50 focus:ring-offset-surface relative mt-1.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:ring-2 focus:ring-offset-2 focus:outline-none ${
          checked ? 'bg-accent' : 'bg-elevated'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform duration-200 ${
            checked ? 'bg-elevated translate-x-5' : 'bg-muted translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
