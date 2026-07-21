import { LazyMotion, domAnimation, type Transition, type Variants } from 'motion/react';

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

/**
 * List item enter variants.
 * Slides in from the right with a spring settle — subtle per-item animation on scroll.
 */
export const listItemVariants: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 38 },
  },
  exit: { opacity: 0 },
};

/** Spring-up variant — gentle bounce for cards, modals, and overlays. */
export const springUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

/**
 * Metadata crossfade variants — used in the now-playing bar when the song
 * changes. Old text slides up and fades out; new text slides up from below.
 */
export const metadataVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export const metadataTransition: Transition = {
  duration: 0.18,
  ease: 'easeOut',
};

/** Slide-up from bottom — used for mobile bottom sheets. */
export const slideUp: Variants = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
};

export const slideUpTransition: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 28,
  mass: 0.6,
};

/** Shared crossfade transition used for page and view mode changes. */
export const viewTransition: Transition = {
  duration: 0.125,
  ease: 'easeOut',
};
