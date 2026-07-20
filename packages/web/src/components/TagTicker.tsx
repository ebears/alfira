import { animate, type AnimationPlaybackControls } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTagColors } from '../context/TagsContext';
import { getTagColorClasses } from '../utils/tagColors';

interface TagTickerProps {
  tags: string[];
  isHovered?: boolean;
}

/** Scroll speed factor — duration = contentWidth × factor. Lower = faster scroll. */
const SCROLL_SPEED_FACTOR = 0.003;

/** Return spring — snappy with a visible bounce. */
const RETURN_SPRING = { type: 'spring' as const, stiffness: 250, damping: 12, mass: 0.3 };

const TagTicker = memo(({ tags, isHovered: externalHovered }: TagTickerProps) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { tagColorMap } = useTagColors();

  // Computed at measure time — how far to scroll and how long to take.
  const targetOffsetRef = useRef(0);
  const scrollDurationRef = useRef(3);

  // Tracks the currently-running animation so we can cancel it.
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  // Tracks whether we are mid-return (animating back to 0).
  const isReturning = useRef(false);

  const dedupedTags = useMemo(() => [...new Set(tags)], [tags]);

  // ── Overflow detection ──────────────────────────────────────────────────

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when tags change to remeasure
  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || outer.clientWidth <= 0) {
      return;
    }

    const overflow = inner.scrollWidth - outer.clientWidth;
    if (overflow > 0) {
      setShouldScroll(true);
      targetOffsetRef.current = overflow;
      scrollDurationRef.current = Math.max(3, inner.scrollWidth * SCROLL_SPEED_FACTOR);
    } else {
      setShouldScroll(false);
      controlsRef.current?.stop();
    }
  }, [tags]);

  // ── Scroll control ──────────────────────────────────────────────────────

  const startScroll = useCallback(() => {
    const el = innerRef.current;
    if (!el || targetOffsetRef.current <= 0) {
      return;
    }
    isReturning.current = false;
    controlsRef.current?.stop();
    const controls = animate(
      el,
      { x: -targetOffsetRef.current },
      { duration: scrollDurationRef.current, ease: 'linear' }
    );
    controlsRef.current = controls;
  }, []);

  const returnToStart = useCallback(() => {
    const el = innerRef.current;
    if (!el || isReturning.current) {
      return;
    }
    isReturning.current = true;
    controlsRef.current?.stop();
    const controls = animate(el, { x: 0 }, RETURN_SPRING);
    controlsRef.current = controls;
  }, []);

  // ── Hover-driven pause / resume ────────────────────────────────────────

  const effectiveHovered = externalHovered ?? isHovered;
  const prevHovered = useRef(false);

  useEffect(() => {
    if (!shouldScroll) {
      return;
    }

    const wasHovered = prevHovered.current;
    prevHovered.current = effectiveHovered;

    if (wasHovered && !effectiveHovered) {
      returnToStart();
    } else if (!wasHovered && effectiveHovered) {
      startScroll();
    }
  }, [effectiveHovered, shouldScroll, startScroll, returnToStart]);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  // ── Tag rendering ──────────────────────────────────────────────────────

  const renderTags = useCallback(
    () =>
      dedupedTags.map((tag) => {
        const tagKey = tag.toLowerCase();
        const explicitColor = tagColorMap[tagKey];
        const colors = getTagColorClasses(tag, explicitColor);
        return (
          <span
            key={tag}
            className={`inline-flex items-center px-1.5 py-0 rounded text-[11px] font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}
          >
            {tag}
          </span>
        );
      }),
    [dedupedTags, tagColorMap]
  );

  // ── Mask style ─────────────────────────────────────────────────────────

  const maskStyle: React.CSSProperties = useMemo(
    () =>
      shouldScroll
        ? {
            maskImage: 'linear-gradient(to right, transparent, black 8%, black 80%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 8%, black 80%, transparent)',
          }
        : {},
    [shouldScroll]
  );

  // ── Event handlers ─────────────────────────────────────────────────────

  const handleMouseEnter = useCallback(() => {
    if (externalHovered === undefined) {
      setIsHovered(true);
    }
  }, [externalHovered]);

  const handleMouseLeave = useCallback(() => {
    if (externalHovered === undefined) {
      setIsHovered(false);
    }
  }, [externalHovered]);

  // ── Render ────────────────────────────────────────────────────────────

  if (dedupedTags.length === 0) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- hover state controls ticker; marquee has dedicated role
    <div
      role='marquee'
      className='overflow-hidden py-0 max-w-[60%]'
      ref={outerRef}
      style={maskStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className='flex gap-1 w-max' ref={innerRef}>
        {renderTags()}
      </div>
    </div>
  );
});

TagTicker.displayName = 'TagTicker';

export default TagTicker;
