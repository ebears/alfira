import { type HTMLAttributes, memo } from 'react';

import { ClayPressable } from './ClayPressable';
import { SpringUp } from './SpringUp';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Enables hover/active clay transitions */
  hoverable?: boolean;
  /** Applies fade-up entrance animation */
  animate?: boolean;
}

export const Card = memo(function Card({
  hoverable = false,
  animate = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  const baseClass = `bg-elevated overflow-hidden ${className}`;

  const card = hoverable ? (
    <ClayPressable depth='medium' className={baseClass} {...rest}>
      {children}
    </ClayPressable>
  ) : (
    <div className={`clay-resting ${baseClass}`} {...rest}>
      {children}
    </div>
  );

  if (animate) {
    return <SpringUp>{card}</SpringUp>;
  }

  return card;
});

export default Card;
