import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const { tagColorMap } = useTagColors();

  const dedupedTags = useMemo(() => [...new Set(tags)], [tags]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when tags change to remeasure overflow
  useEffect(() => {
    if (outerRef.current && innerRef.current && outerRef.current.clientWidth > 0) {
      const overflow = innerRef.current.scrollWidth > outerRef.current.clientWidth;
      setShouldScroll(overflow);

      if (overflow) {
        const contentWidth = innerRef.current.scrollWidth;
        setDuration(Math.max(10, contentWidth * 0.02));
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

  if (dedupedTags.length === 0) return null;

  const effectiveHovered = externalHovered ?? isHovered;

  const animationStyle: React.CSSProperties =
    shouldScroll && effectiveHovered
      ? {
          width: 'max-content',
          animation: `ticker-scroll ${duration}s linear infinite`,
        }
      : shouldScroll
        ? { width: 'max-content' }
        : {};

  return (
    <div
      role="marquee"
      className="overflow-hidden py-0 max-w-[60%]"
      ref={outerRef}
      style={{
        ...(shouldScroll && {
          maskImage: 'linear-gradient(to right, transparent, black 8%, black 80%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 8%, black 80%, transparent)',
        }),
      }}
      onMouseEnter={() => {
        if (externalHovered === undefined) setIsHovered(true);
      }}
      onMouseLeave={() => {
        if (externalHovered === undefined) setIsHovered(false);
      }}
    >
      <div className="flex gap-1" ref={innerRef} style={animationStyle}>
        {renderTags('a')}
        {shouldScroll && renderTags('b')}
      </div>
    </div>
  );
});

TagTicker.displayName = 'TagTicker';

export default TagTicker;
