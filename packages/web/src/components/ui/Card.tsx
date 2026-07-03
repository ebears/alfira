import { type HTMLAttributes, memo } from 'react';

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
  const hoverClasses = hoverable
    ? 'hover:clay-raised hover:-translate-y-px active:clay-flat active:translate-y-0'
    : '';
  const animateClasses = animate ? 'animate-fade-up opacity-0' : '';

  return (
    <div
      className={`bg-elevated clay-resting transition-all duration-100 ${hoverClasses} ${animateClasses} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export default Card;
