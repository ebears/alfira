import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useTheme } from '../../context/ThemeContext';

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
            ].map(({ key, icon: Icon, label }) => {
              const isSelected = mode === key;
              return (
                <button
                  key={key}
                  type='button'
                  onClick={() => setMode(key)}
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
            })}
          </div>
        </div>

        {/* Vertical divider — only on md+ */}
        <div className='hidden md:block w-px bg-muted/15 self-stretch shrink-0' />

        {/* Color Theme Selector */}
        <div className='space-y-3 flex-1 min-w-0'>
          <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider pl-1'>Color</h3>
          <div className='grid grid-cols-4 sm:grid-cols-5 md:grid-cols-4 lg:grid-cols-5 gap-3 justify-items-start'>
            {colorThemes.map((t) => {
              const isSelected = colorTheme === t.name;
              return (
                <button
                  key={t.name}
                  type='button'
                  onClick={() => setColorTheme(t.name)}
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
                    style={{ backgroundColor: t.accentColor }}
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
                  <span className='text-[11px] text-muted leading-none mt-1'>{t.displayName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
