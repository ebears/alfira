import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useTagColors } from '../context/TagsContext';
import { getTagColorClasses } from '../utils/tagColors';

interface TagTickerProps {
  tags: string[];
  isHovered?: boolean;
}

const TagTicker = memo(({ tags, isHovered: externalHovered }: TagTickerProps) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [duration, setDuration] = useState(15);
  const prevHoveredRef = useRef(false);
  const durationRef = useRef(15);
  const { tagColorMap } = useTagColors();

  const dedupedTags = useMemo(() => [...new Set(tags)], [tags]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when tags change to remeasure overflow
  useEffect(() => {
    if (outerRef.current && innerRef.current && outerRef.current.clientWidth > 0) {
      const overflow = innerRef.current.scrollWidth > outerRef.current.clientWidth;
      setShouldScroll(overflow);

      if (overflow) {
        const contentWidth = innerRef.current.scrollWidth;
        const d = Math.max(10, contentWidth * 0.02);
        setDuration(d);
        durationRef.current = d;
      }
    }
  }, [tags]);

  const renderTags = useCallback(
    (prefix: string) =>
      dedupedTags.map((tag) => {
        const tagKey = tag.toLowerCase();
        const explicitColor = tagColorMap[tagKey];
        const colors = getTagColorClasses(tag, explicitColor);
        return (
          <span
            key={`${prefix}-${tag}`}
            className={`inline-flex items-center px-1.5 py-0 rounded text-[11px] font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}
          >
            {tag}
          </span>
        );
      }),
    [dedupedTags, tagColorMap]
  );

  const effectiveHovered = externalHovered ?? isHovered;

  // Smooth return on de-hover: pause animation at current position, then transition back to 0
  useLayoutEffect(() => {
    if (!shouldScroll) {
      return;
    }

    const prev = prevHoveredRef.current;
    prevHoveredRef.current = effectiveHovered;

    if (prev && !effectiveHovered) {
      // De-hovered: capture paused position and transition back to start
      const el = innerRef.current;
      if (!el) {
        return;
      }

      const computed = getComputedStyle(el);
      const matrix = new DOMMatrixReadOnly(computed.transform);
      const x = matrix.m41;

      // Replace animation with static transform at captured position
      el.style.animation = 'none';
      el.style.transform = `translateX(${x}px)`;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- force layout reflow
      el.offsetHeight;

      // Transition back to 0
      el.style.transition = 'transform 0.5s ease-out';
      el.style.transform = 'translateX(0)';

      const onEnd = () => {
        el.style.transition = '';
        el.style.transform = '';
        el.style.animation = '';
        el.removeEventListener('transitionend', onEnd);
      };
      el.addEventListener('transitionend', onEnd);

      return () => el.removeEventListener('transitionend', onEnd);
    }

    if (!prev && effectiveHovered) {
      // Re-hovered: cancel any in-progress return and restart animation
      const el = innerRef.current;
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
        el.style.animation = `ticker-scroll ${durationRef.current}s linear infinite`;
      }
    }
  }, [effectiveHovered, shouldScroll]);

  const animationStyle: React.CSSProperties = useMemo(
    () =>
      shouldScroll
        ? {
            width: 'max-content',
            animation: `ticker-scroll ${duration}s linear infinite`,
            animationPlayState: effectiveHovered ? 'running' : 'paused',
          }
        : {},
    [shouldScroll, duration, effectiveHovered]
  );

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

  if (dedupedTags.length === 0) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- hover state pauses ticker; marquee has dedicated role
    <div
      role='marquee'
      className='overflow-hidden py-0 max-w-[60%]'
      ref={outerRef}
      style={maskStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className='flex gap-1' ref={innerRef} style={animationStyle}>
        {renderTags('a')}
        {shouldScroll && renderTags('b')}
      </div>
    </div>
  );
});

TagTicker.displayName = 'TagTicker';

export default TagTicker;
