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
  return (
    <div className={`flex items-start gap-4 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="font-body text-sm font-medium text-fg">{label}</p>
        {description && <p className="font-mono text-[11px] text-muted mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface mt-1.5 ${
          checked ? 'bg-accent' : 'bg-elevated'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ${
            checked ? 'translate-x-5 bg-elevated' : 'translate-x-0 bg-muted'
          }`}
        />
      </button>
    </div>
  );
}
