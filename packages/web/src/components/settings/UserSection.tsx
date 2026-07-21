import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { memo, useCallback, useMemo, useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import SettingsToggle from './SettingsToggle';

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
  const handleClick = useCallback(() => {
    onSelect(mode);
  }, [onSelect, mode]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`group flex cursor-pointer flex-col items-center rounded-lg p-1 transition-all ${
        isSelected ? 'opacity-100' : 'opacity-50'
      }`}
    >
      <span
        className={`text-muted flex h-10 w-10 items-center justify-center rounded-full transition-all sm:h-12 sm:w-12 ${
          isSelected
            ? 'bg-accent/15 text-accent ring-offset-background ring-foreground ring-2 ring-offset-2'
            : 'bg-muted/10 group-hover:ring-muted/30 group-hover:ring-1'
        }`}
      >
        <Icon size={20} weight='duotone' />
      </span>
      <span className='text-muted mt-1 text-[11px] leading-none'>{label}</span>
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
  const handleClick = useCallback(() => {
    onSelect(name);
  }, [onSelect, name]);

  const dotStyle = useMemo(() => ({ backgroundColor: accentColor }), [accentColor]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`group flex cursor-pointer flex-col items-center rounded-lg p-1 transition-all ${
        isSelected ? 'opacity-100' : 'opacity-80'
      }`}
    >
      <span
        className={`border-border/40 flex h-10 w-10 items-center justify-center rounded-full border transition-all sm:h-12 sm:w-12 ${
          isSelected
            ? 'ring-offset-background ring-foreground ring-2 ring-offset-2'
            : 'group-hover:ring-muted/30 group-hover:ring-2'
        }`}
        style={dotStyle}
      >
        {isSelected ? (
          <svg
            className='h-5 w-5 text-white'
            fill='currentColor'
            viewBox='0 0 12 12'
            aria-hidden='true'
          >
            <path d='M10.28 2.28L4.5 8.06l-2.78-2.79a.5.5 0 0 0-.71.71l3.15 3.15a.5.5 0 0 0 .71 0l6.36-6.36a.5.5 0 0 0 0-.71.5.5 0 0 0-.71 0z' />
          </svg>
        ) : null}
      </span>
      <span className='text-muted mt-1 text-[11px] leading-none'>{displayName}</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function UserSection() {
  const { user } = useAuth();
  const { colorTheme, mode, setColorTheme, setMode, colorThemes } = useTheme();

  const [hintAnimationOn, setHintAnimationOn] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('alfira-admin-button-animation') !== 'false';
    }
    return true;
  });

  const handleHintAnimationChange = useCallback((on: boolean) => {
    setHintAnimationOn(on);
    localStorage.setItem('alfira-admin-button-animation', String(on));
  }, []);

  return (
    <div className='space-y-6'>
      {/* Theme & Color — side by side on md+ */}
      <div className='flex flex-col gap-6 md:flex-row'>
        {/* Mode selectors */}
        <div className='shrink-0 space-y-3'>
          <h3 className='text-muted font-mono text-[11px] tracking-wider uppercase'>Theme</h3>
          <div className='flex gap-2 md:flex-col'>
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
        <div className='bg-muted/15 hidden w-px shrink-0 self-stretch md:block' />

        {/* Color Theme Selector */}
        <div className='min-w-0 flex-1 space-y-3'>
          <h3 className='text-muted pl-1 font-mono text-[11px] tracking-wider uppercase'>Color</h3>
          <div className='grid grid-cols-4 justify-items-start gap-3 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5'>
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

      {/* Admin button hint animation — only shown to admins */}
      {user?.isAdmin && (
        <>
          <div className='bg-muted/15 h-px' />
          <SettingsToggle
            label='Admin button hint animation'
            description='Occasionally spins and glows the admin/member toggle button in the sidebar to remind you it is clickable.'
            checked={hintAnimationOn}
            onChange={handleHintAnimationChange}
          />
        </>
      )}
    </div>
  );
}
