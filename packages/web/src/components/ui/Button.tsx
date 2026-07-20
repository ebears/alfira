import type React from 'react';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'surface' | 'inherit' | 'danger';
type ButtonSize = 'default' | 'icon';
type ButtonSurface = 'base' | 'surface' | 'elevated';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  surface?: ButtonSurface;
  /** Visually disabled styling + cursor-not-allowed, but onClick still fires. */
  dimmed?: boolean;
}

const defaultClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-primary-secondary',
  surface: 'btn-primary-surface',
  inherit: 'btn-inherit',
  danger: 'btn-danger',
};

const iconClasses: Record<ButtonVariant, string> = {
  primary: 'btn-icon-primary',
  secondary: 'btn-icon-primary-secondary',
  surface: 'btn-icon-primary-surface',
  inherit: 'btn-icon-inherit',
  danger: 'btn-icon-danger',
};

const surfaceVars: Record<ButtonSurface, string> = {
  base: 'var(--color-base)',
  surface: 'var(--color-surface)',
  elevated: 'var(--color-elevated)',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'default',
    surface = 'surface',
    dimmed,
    className,
    style,
    ...props
  }: ButtonProps,
  ref
) {
  const base = size === 'icon' ? iconClasses[variant] : defaultClasses[variant];
  const inheritStyle: React.CSSProperties =
    variant === 'inherit'
      ? ({ ...style, '--btn-surface': surfaceVars[surface] } as React.CSSProperties)
      : style || {};

  // dimmed = visually disabled but still clickable (for cooldown toasts).
  // Don't pass disabled to the native element when dimmed.
  const { disabled: _disabled, ...restProps } = props;
  const dimmedClass = dimmed ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      ref={ref}
      type='button'
      disabled={dimmed ? undefined : _disabled}
      className={[base, dimmedClass, className].filter(Boolean).join(' ')}
      style={inheritStyle}
      {...restProps}
    />
  );
});
