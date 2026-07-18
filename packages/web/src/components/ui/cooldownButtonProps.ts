import type { CooldownState } from '../../hooks/useCooldownGuard';

interface CooldownButtonOpts {
  onClick: () => void;
  /** Native disabled state — cooldown overrides it (dimmed + clickable) */
  disabled?: boolean;
  /** Default tooltip when not in cooldown/approaching state */
  title: string;
}

/**
 * Convert a CooldownState + button options into the merged props for a
 * cooldown-aware Button/BarButton: onClick, disabled, dimmed, and title
 * are all wired up consistently.
 *
 * This is a pure function (not a hook) so it's safe inside memo components.
 */
export function cooldownButtonProps(
  c: CooldownState,
  opts: CooldownButtonOpts
): {
  onClick: () => void;
  disabled: boolean;
  dimmed: boolean;
  title: string;
} {
  return {
    onClick: c.coolingDown ? c.onCooldownClick : opts.onClick,
    disabled: !!opts.disabled && !c.coolingDown,
    dimmed: c.coolingDown,
    title: c.statusTitle ?? opts.title,
  };
}
