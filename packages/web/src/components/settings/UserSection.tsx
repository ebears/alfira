import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { memo, useCallback, useMemo } from 'react';

import { useTheme } from '../../context/ThemeContext';

// ---------------------------------------------------------------------------
// Child components — extracted so useCallback closures are stable per item
// ---------------------------------------------------------------------------

interface ThemeModeButtonProps {
  mode: 'auto' | 'light' | 'dark';
  icon: typeof DesktopIcon;
  label: string;
  isSelected: boolean;
  onSelect: (mode: 'auto' | 'light' | 'dark') => void;
}

const ThemeModeButton = memo(function ThemeModeButton({
  mode,
  icon: Icon,
  label,
  isSelected,
  onSelect,
}: ThemeModeButtonProps) {
  const handleClick = useCallback(() => onSelect(mode), [onSelect, mode]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`flex flex-col items-center p-1 rounded-lg transition-all cursor-pointer group ${
        isSelected ? 'opacity-100' : 'opacity-50'
      }`}
    >
      <span
        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-muted transition-all ${
          isSelected
            ? 'bg-accent/15 text-accent ring-2 ring-offset-2 ring-offset-background ring-foreground'
            : 'bg-muted/10 group-hover:ring-1 group-hover:ring-muted/30'
        }`}
      >
        <Icon size={20} weight='duotone' />
      </span>
      <span className='text-[11px] text-muted leading-none mt-1'>{label}</span>
    </button>
  );
});

interface ThemeColorButtonProps {
  name: string;
  displayName: string;
  accentColor: string;
  isSelected: boolean;
  onSelect: (name: string) => void;
}

const ThemeColorButton = memo(function ThemeColorButton({
  name,
  displayName,
  accentColor,
  isSelected,
  onSelect,
}: ThemeColorButtonProps) {
  const handleClick = useCallback(() => onSelect(name), [onSelect, name]);

  const dotStyle = useMemo(() => ({ backgroundColor: accentColor }), [accentColor]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`flex flex-col items-center p-1 rounded-lg transition-all cursor-pointer group ${
        isSelected ? 'opacity-100' : 'opacity-80'
      }`}
    >
      <span
        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all border border-border/40 ${
          isSelected
            ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground'
            : 'group-hover:ring-2 group-hover:ring-muted/30'
        }`}
        style={dotStyle}
      >
        {isSelected ? (
          <svg
            className='w-5 h-5 text-white'
            fill='currentColor'
            viewBox='0 0 12 12'
            aria-hidden='true'
          >
            <path d='M10.28 2.28L4.5 8.06l-2.78-2.79a.5.5 0 0 0-.71.71l3.15 3.15a.5.5 0 0 0 .71 0l6.36-6.36a.5.5 0 0 0 0-.71.5.5 0 0 0-.71 0z' />
          </svg>
        ) : null}
      </span>
      <span className='text-[11px] text-muted leading-none mt-1'>{displayName}</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function UserSection() {
  const { colorTheme, mode, setColorTheme, setMode, colorThemes } = useTheme();

  return (
    <div className='space-y-6'>
      {/* Theme & Color — side by side on md+ */}
      <div className='flex flex-col md:flex-row gap-6'>
        {/* Mode selectors */}
        <div className='space-y-3 shrink-0'>
          <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider'>Theme</h3>
          <div className='flex md:flex-col gap-2'>
            {[
              { key: 'auto' as const, icon: DesktopIcon, label: 'Auto' },
              { key: 'light' as const, icon: SunIcon, label: 'Light' },
              { key: 'dark' as const, icon: MoonIcon, label: 'Dark' },
            ].map(({ key, icon, label }) => (
              <ThemeModeButton
                key={key}
                mode={key}
                icon={icon}
                label={label}
                isSelected={mode === key}
                onSelect={setMode}
              />
            ))}
          </div>
        </div>

        {/* Vertical divider — only on md+ */}
        <div className='hidden md:block w-px bg-muted/15 self-stretch shrink-0' />

        {/* Color Theme Selector */}
        <div className='space-y-3 flex-1 min-w-0'>
          <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider pl-1'>Color</h3>
          <div className='grid grid-cols-4 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5 gap-3 justify-items-start'>
            {colorThemes.map((t) => (
              <ThemeColorButton
                key={t.name}
                name={t.name}
                displayName={t.displayName}
                accentColor={t.accentColor}
                isSelected={colorTheme === t.name}
                onSelect={setColorTheme as (name: string) => void}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
