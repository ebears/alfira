import type React from 'react';

import { CheckIcon } from '@phosphor-icons/react';
import { useCallback } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'accent' | 'danger' | 'muted';
}

const sizeConfig = {
  sm: { box: 'w-4 h-4', icon: 12, border: 'border-[1.5px]', rounded: 'rounded' },
  md: { box: 'w-5 h-5', icon: 16, border: 'border-2', rounded: 'rounded-md' },
} as const;

const variantChecked = {
  accent: 'bg-accent border-accent',
  danger: 'bg-danger border-danger',
  muted: 'bg-muted border-muted',
} as const;

const variantIcon = {
  accent: 'text-white',
  danger: 'text-white',
  muted: 'text-surface',
} as const;

export default function Checkbox({
  checked,
  onChange,
  disabled = false,
  size = 'sm',
  variant = 'accent',
}: CheckboxProps) {
  const s = sizeConfig[size];

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  return (
    <span
      className={`group relative inline-flex shrink-0 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {/* Hidden native input fills the entire box, capturing clicks even inside parent labels */}
      <input
        type='checkbox'
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        className={`absolute inset-0 z-10 opacity-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      />
      <span
        aria-hidden
        className={` ${s.box} ${s.rounded} ${s.border} group-focus-within:ring-accent/50 group-focus-within:ring-offset-surface flex shrink-0 items-center justify-center transition-colors duration-150 group-focus-within:ring-2 group-focus-within:ring-offset-2 ${checked ? variantChecked[variant] : 'border-border bg-surface'} `}
      >
        <CheckIcon
          size={s.icon}
          weight='bold'
          className={`transition-all duration-150 ease-out ${
            checked ? `scale-100 opacity-100 ${variantIcon[variant]}` : 'scale-0 opacity-0'
          }`}
        />
      </span>
    </span>
  );
}
