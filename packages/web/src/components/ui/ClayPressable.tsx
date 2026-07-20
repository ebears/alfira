import { useAnimate } from 'motion/react';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';

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
// A subtle blurred shadow above and below defines all edges without the harsh
// 1px ring that can alias at corners on light backgrounds.

const LIGHT_RESTING =
  '0 2px 0 0 color-mix(in srgb, var(--color-surface) 60%, black), 0 2px 6px 0 rgba(0, 0, 0, 0.1), 0 0 1px 1px rgba(0, 0, 0, 0.06)';
const LIGHT_HOVERING =
  '0 4px 0 0 color-mix(in srgb, var(--color-surface) 60%, black), 0 4px 6px 0 rgba(0, 0, 0, 0.14), 0 0 1px 1px rgba(0, 0, 0, 0.1)';
const LIGHT_PRESSING =
  '0 1px 0 0 color-mix(in srgb, var(--color-surface) 80%, black), inset 0 2px 3px 0 rgba(0, 0, 0, 0.1), inset 0 -2px 3px 0 rgba(0, 0, 0, 0.08)';

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

function clayStyle(
  state: 'resting' | 'hovering' | 'pressing',
  mode: 'dark' | 'light'
): React.CSSProperties {
  const bg =
    state === 'resting'
      ? undefined
      : state === 'hovering'
        ? 'color-mix(in srgb, var(--color-elevated) 88%, white)'
        : 'color-mix(in srgb, var(--color-elevated) 92%, black)';

  return {
    boxShadow: shadows[mode][state],
    backgroundColor: bg,
    transition: `box-shadow ${state === 'pressing' ? '0.08s' : '0.15s'} ease-out, background-color 0.15s ease-out`,
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
  style: outerStyle,
  children,
  ...rest
}: ClayPressableProps) {
  const [clayState, setClayState] = useState<'resting' | 'hovering' | 'pressing'>('resting');
  const preset = depthPresets[depth];
  const mode = useColorMode();

  // Imperative tap animation — gated on target so buttons inside don't sink the card.
  const [scope, animate] = useAnimate();
  const didPressRef = useRef(false);
  const isHoveringRef = useRef(false);

  // ── Event handlers ────────────────────────────────────────────────────

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

  const handleTapStart = useCallback(
    (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (disabled) {
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        didPressRef.current = false;
        return;
      }
      didPressRef.current = true;
      setClayState('pressing');
      animate(scope.current, { y: preset.tapY }, claySpring);
    },
    [disabled, animate, scope, preset.tapY]
  );

  const handleTapEnd = useCallback(() => {
    if (disabled || !didPressRef.current) {
      return;
    }
    // If the pointer is still over the card after the tap, go back to hovering
    // instead of resting — the cursor never left, so it should still look active.
    if (isHoveringRef.current) {
      setClayState('hovering');
      animate(scope.current, { y: preset.hoverY }, claySpring);
    } else {
      setClayState('resting');
      animate(scope.current, { y: 0 }, claySpring);
    }
  }, [disabled, animate, scope, preset.hoverY]);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
  }, []);

  // ── Motion props ──────────────────────────────────────────────────────

  const whileHover = useMemo(
    () => (disabled ? undefined : { y: preset.hoverY }),
    [disabled, preset.hoverY]
  );

  const mergedStyle = useMemo(
    () => Object.assign({}, outerStyle, clayStyle(clayState, mode)),
    [outerStyle, clayState, mode]
  );

  // ── Render ────────────────────────────────────────────────────────────

  const Component = Element === 'button' ? m.button : m.div;

  return (
    // @ts-expect-error motion component props are compatible but TypeScript can't infer
    <Component
      ref={scope}
      className={className}
      style={mergedStyle}
      whileHover={whileHover}
      transition={claySpring}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
      onTapStart={handleTapStart}
      onTap={handleTapEnd}
      onTapCancel={handleTapEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default ClayPressable;
