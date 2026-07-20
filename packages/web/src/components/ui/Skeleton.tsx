import * as m from 'motion/react-m';

// ---------------------------------------------------------------------------
// Shared shimmer gradient — matches the old .skeleton CSS class
// ---------------------------------------------------------------------------

const SHIMMER_GRADIENT =
  'linear-gradient(90deg, var(--color-elevated) 25%, var(--color-border) 50%, var(--color-elevated) 75%)';

// ---------------------------------------------------------------------------
// Static animation config — identical for every skeleton instance,
// so we define them at module scope to avoid per-render object allocations.
// ---------------------------------------------------------------------------

const SKELETON_STYLE: React.CSSProperties = {
  background: SHIMMER_GRADIENT,
  backgroundSize: '400px 100%',
};

const SKELETON_INITIAL = { opacity: 0, backgroundPosition: '-400px 0' } as const;
const SKELETON_ANIMATE = { opacity: 1, backgroundPosition: '400px 0' } as const;

const SKELETON_TRANSITION = {
  opacity: { duration: 0, delay: 0.2 },
  backgroundPosition: { duration: 1.4, delay: 0.2, repeat: Infinity, ease: 'linear' } as const,
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SkeletonProps {
  /** Tailwind sizing / spacing / rounding classes passed through to the element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Motion-powered skeleton placeholder.
 *
 * Fades in after a brief delay then shimmers indefinitely — same visual as the
 * old CSS `.skeleton` class but driven entirely by Motion.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <m.div
      className={className}
      style={SKELETON_STYLE}
      initial={SKELETON_INITIAL}
      animate={SKELETON_ANIMATE}
      transition={SKELETON_TRANSITION}
    />
  );
}

export default Skeleton;
