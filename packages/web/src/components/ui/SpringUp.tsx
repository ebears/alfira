import type { ReactNode } from 'react';
import * as m from 'motion/react-m';
import { springUp } from '../../lib/motion';

interface SpringUpProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps children in a motion.div that springs up on mount.
 * Uses shared spring variants from lib/motion.ts.
 */
export function SpringUp({ children, className }: SpringUpProps) {
  return (
    <m.div initial='hidden' animate='show' variants={springUp} className={className}>
      {children}
    </m.div>
  );
}
