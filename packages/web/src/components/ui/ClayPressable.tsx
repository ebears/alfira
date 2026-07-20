import * as m from 'motion/react-m';
import { useCallback, useEffect, useMemo, useState, type HTMLAttributes } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClayDepth = 'shallow' | 'medium' | 'deep';

interface ClayPressableProps extends HTMLAttributes<HTMLElement> {
  /** Render as a different element (default: div). Use "button" for interactive buttons. */
  as?: 'div' | 'button';
  /** Depth preset controlling how much the surface lifts and presses. */
  depth?: ClayDepth;
  /** Disables the hover/press animation entirely. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Depth presets — y offset per state
// ---------------------------------------------------------------------------

const depthPresets: Record<ClayDepth, { hoverY: number; tapY: number }> = {
  shallow: { hoverY: -0.5, tapY: 1 },
  medium: { hoverY: -1, tapY: 2 },
  deep: { hoverY: -1, tapY: 3 },
};

// ---------------------------------------------------------------------------
// Spring config — firm clay: fast settle, minimal bounce
// ---------------------------------------------------------------------------

const claySpring = { type: 'spring' as const, stiffness: 600, damping: 30, mass: 0.8 };

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------
// All shadow values are hardcoded per mode to bypass Tailwind CSS v4 tree-shaking
// and to ensure the correct physical illusion:
//
//   Resting / Hover → outward drop shadows (button floats above the page)
//   Pressed          → inward inset shadows  (button is sunken into the page)
//
// The active mode is detected at runtime via document.documentElement.dataset.mode.
// ---------------------------------------------------------------------------

// ── Dark mode ──────────────────────────────────────────────────────────

const DARK_RESTING =
  '0 2px 0 0 color-mix(in srgb, var(--color-surface) 60%, black), 0 2px 6px 0 rgba(0, 0, 0, 0.2)';
const DARK_HOVERING =
  '0 4px 0 0 color-mix(in srgb, var(--color-surface) 60%, black), 0 4px 10px 0 rgba(0, 0, 0, 0.25)';
const DARK_PRESSING =
  '0 1px 0 0 color-mix(in srgb, var(--color-surface) 80%, black), inset 0 2px 3px 0 rgba(0, 0, 0, 0.18), inset 0 1px 1px 0 rgba(0, 0, 0, 0.08)';

// ── Light mode ─────────────────────────────────────────────────────────

// No negative-spread shadows — they cause corner flattening on rounded elements.
// A subtle 1px ring defines all edges so the top corners don't blend into the
// background, and a white inset highlight at the top edge sells the raised surface.

const LIGHT_RESTING =
  '0 2px 0 0 color-mix(in srgb, var(--color-surface) 60%, black), 0 2px 6px 0 rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.06)';
const LIGHT_HOVERING =
  '0 4px 0 0 color-mix(in srgb, var(--color-surface) 60%, black), 0 4px 6px 0 rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.1)';
const LIGHT_PRESSING =
  '0 1px 0 0 color-mix(in srgb, var(--color-surface) 80%, black), inset 0 2px 3px 0 rgba(0, 0, 0, 0.1), inset 0 1px 1px 0 rgba(0, 0, 0, 0.06)';

// ── Mode detection ─────────────────────────────────────────────────────

function useColorMode(): 'dark' | 'light' {
  const [mode, setMode] = useState<'dark' | 'light'>(() => {
    if (typeof document === 'undefined') {
      return 'dark';
    }
    const m = document.documentElement.dataset.mode;
    return m === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      const m = el.dataset.mode;
      if (m === 'light' || m === 'dark') {
        setMode(m);
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['data-mode'] });
    const current = el.dataset.mode;
    if (current === 'light' || current === 'dark') {
      setMode(current);
    }
    return () => observer.disconnect();
  }, []);

  return mode;
}

// ── Shadow lookup ──────────────────────────────────────────────────────

const shadows: Record<'dark' | 'light', Record<'resting' | 'hovering' | 'pressing', string>> = {
  dark: { resting: DARK_RESTING, hovering: DARK_HOVERING, pressing: DARK_PRESSING },
  light: { resting: LIGHT_RESTING, hovering: LIGHT_HOVERING, pressing: LIGHT_PRESSING },
};

function clayShadowStyle(
  state: 'resting' | 'hovering' | 'pressing',
  mode: 'dark' | 'light'
): React.CSSProperties {
  return {
    boxShadow: shadows[mode][state],
    transition: `box-shadow ${state === 'pressing' ? '0.08s' : '0.15s'} ease-out`,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClayPressable({
  as: Element = 'div',
  depth = 'medium',
  disabled = false,
  className = '',
  children,
  ...rest
}: ClayPressableProps) {
  const [clayState, setClayState] = useState<'resting' | 'hovering' | 'pressing'>('resting');
  const preset = depthPresets[depth];
  const mode = useColorMode();

  // ── Event handlers — track clay state for CSS shadow ──────────────────

  const handleHoverStart = useCallback(() => {
    if (disabled) {
      return;
    }
    setClayState('hovering');
  }, [disabled]);

  const handleHoverEnd = useCallback(() => {
    if (disabled) {
      return;
    }
    setClayState('resting');
  }, [disabled]);

  const handleTapStart = useCallback(() => {
    if (disabled) {
      return;
    }
    setClayState('pressing');
  }, [disabled]);

  const handleTapEnd = useCallback(() => {
    if (disabled) {
      return;
    }
    setClayState('resting');
  }, [disabled]);

  // ── Motion props ──────────────────────────────────────────────────────

  const whileHover = useMemo(
    () => (disabled ? undefined : { y: preset.hoverY }),
    [disabled, preset.hoverY]
  );
  const whileTap = useMemo(
    () => (disabled ? undefined : { y: preset.tapY }),
    [disabled, preset.tapY]
  );

  // ── Render ────────────────────────────────────────────────────────────

  const Component = Element === 'button' ? m.button : m.div;

  return (
    // @ts-expect-error motion component props are compatible but TypeScript can't infer
    <Component
      className={className}
      style={clayShadowStyle(clayState, mode)}
      whileHover={whileHover}
      whileTap={whileTap}
      transition={claySpring}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
      onTapStart={handleTapStart}
      onTap={handleTapEnd}
      onTapCancel={handleTapEnd}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default ClayPressable;
