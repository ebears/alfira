import type React from 'react';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Color themes based on D&D 5e core classes
export type ColorThemeName =
  | 'artificer'
  | 'barbarian'
  | 'bard'
  | 'cleric'
  | 'druid'
  | 'fighter'
  | 'monk'
  | 'paladin'
  | 'ranger'
  | 'rogue'
  | 'sorcerer'
  | 'warlock'
  | 'wizard';

export type ColorMode = 'light' | 'dark' | 'auto';

export interface ColorTheme {
  name: ColorThemeName;
  displayName: string;
  accentColor: string; // Preview color for UI
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    name: 'artificer',
    displayName: 'Artificer',
    accentColor: '#8b5cf6', // Soft violet
  },
  {
    name: 'barbarian',
    displayName: 'Barbarian',
    accentColor: '#dc2626', // Red
  },
  {
    name: 'bard',
    displayName: 'Bard',
    accentColor: '#db2777', // Pink-600
  },
  {
    name: 'cleric',
    displayName: 'Cleric',
    accentColor: '#84cc16', // Vibrant lime
  },
  {
    name: 'druid',
    displayName: 'Druid',
    accentColor: '#f43f5e', // Rose-500
  },
  {
    name: 'fighter',
    displayName: 'Fighter',
    accentColor: '#d97706', // Forged bronze
  },
  {
    name: 'monk',
    displayName: 'Monk',
    accentColor: '#14b8a6', // Cyan/Teal
  },
  {
    name: 'paladin',
    displayName: 'Paladin',
    accentColor: '#eab308', // Holy gold
  },
  {
    name: 'ranger',
    displayName: 'Ranger',
    accentColor: '#16a34a', // Emerald green
  },
  {
    name: 'rogue',
    displayName: 'Rogue',
    accentColor: '#6366f1', // Indigo
  },
  {
    name: 'sorcerer',
    displayName: 'Sorcerer',
    accentColor: '#e11d48', // Crimson
  },
  {
    name: 'warlock',
    displayName: 'Warlock',
    accentColor: '#a855f7', // Arcane violet
  },
  {
    name: 'wizard',
    displayName: 'Wizard',
    accentColor: '#3b82f6', // Deep Blue
  },
];

const COLOR_THEME_STORAGE_KEY = 'alfira-color-theme';
const MODE_STORAGE_KEY = 'alfira-mode';

interface ThemeContextValue {
  colorTheme: ColorThemeName;
  mode: ColorMode;
  resolvedMode: 'light' | 'dark';
  setColorTheme: (theme: ColorThemeName) => void;
  setMode: (mode: ColorMode) => void;
  colorThemes: ColorTheme[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMode(mode: ColorMode): 'light' | 'dark' {
  if (mode !== 'auto') {
    return mode;
  }
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorThemeName>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(COLOR_THEME_STORAGE_KEY);
      if (stored && COLOR_THEMES.some((t) => t.name === stored)) {
        return stored as ColorThemeName;
      }
    }
    return 'artificer';
  });
  const [mode, setModeState] = useState<ColorMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(MODE_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'auto') {
        return stored;
      }
    }
    return 'auto';
  });
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() =>
    resolveMode(
      typeof window !== 'undefined'
        ? ((localStorage.getItem(MODE_STORAGE_KEY) as ColorMode | null) ?? 'auto')
        : 'auto'
    )
  );

  // Resolve mode and listen for system preference changes
  useEffect(() => {
    setResolvedMode(resolveMode(mode));

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      if (mode === 'auto') {
        setResolvedMode(mq.matches ? 'light' : 'dark');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-color-theme', colorTheme);
    document.documentElement.setAttribute('data-mode', resolvedMode);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
    localStorage.setItem(MODE_STORAGE_KEY, mode);

    // Update PWA theme-color to match the app's elevated surface color
    const elevated = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-elevated')
      .trim();
    if (elevated) {
      document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
        el.setAttribute('content', elevated);
      });
    }
  }, [colorTheme, mode, resolvedMode]);

  const themeValue = useMemo(
    () => ({
      colorTheme,
      mode,
      resolvedMode,
      setColorTheme: setColorThemeState,
      setMode: setModeState,
      colorThemes: COLOR_THEMES,
    }),
    [colorTheme, mode, resolvedMode]
  );

  return <ThemeContext value={themeValue}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
