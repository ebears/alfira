import { LazyMotion, domAnimation, type Variants } from 'motion/react';

/**
 * Shared page transition variants.
 * Subtle upward fade — quick enough to feel responsive, slow enough to register.
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export { LazyMotion, domAnimation };
