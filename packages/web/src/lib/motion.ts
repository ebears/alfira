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

/**
 * Queue item enter/exit variants.
 * Slides in from the right on enter, fades out on exit.
 */
export const queueItemVariants: Variants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
};

export { LazyMotion, domAnimation };

/** Spring-up variant — gentle bounce for cards, modals, and overlays. */
export const springUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};
