import { type ReactNode } from 'react';
import * as m from 'motion/react-m';
import { springUp } from '../../lib/motion';

interface SpringUpProps {
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Wraps children in a motion.div that springs up on mount.
 * Uses shared spring variants from lib/motion.ts.
 */
export function SpringUp({ children, className, onClick }: SpringUpProps) {
  return (
    <m.div
      initial='hidden'
      animate='show'
      variants={springUp}
      className={className}
      onClick={onClick}
    >
      {children}
    </m.div>
  );
}
