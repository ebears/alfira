import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollObserverResult {
  scrollTop: number;
  isScrolling: boolean;
  height: number;
  /** Width of the observed element, throttled to avoid excessive masonry recalculations during animated resizes. */
  width: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Observes scroll position and size of an element with rAF-batched scroll
 * tracking and ResizeObserver-based height measurement.
 *
 * Patterned after masonic's `useScroller` but works with any scroll element,
 * not just `window`. The rAF batching prevents excessive React re-renders
 * during fast scrolling (at most one state update per animation frame).
 *
 * @param elementRef - Ref to the scroll container element.
 * @param fps - Maximum scroll position updates per second. Default 12.
 */
export function useScrollObserver(
  elementRef: RefObject<HTMLElement | null>,
  fps = 12
): ScrollObserverResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  // Seed with a reasonable DOM-based fallback so the first render pass
  // has a close-to-correct width for usePositioner. The useLayoutEffect
  // below reads the real element dimensions and refines before paint.
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return 960;
    return document.querySelector('main')?.clientWidth ?? 960;
  });

  const didMountRef = useRef(0);
  const tickingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollTopRef = useRef(0);

  // ── rAF-batched scroll tracking ────────────────────────────────────
  // Reads the current scrollTop inside a rAF callback so no more than one
  // state update occurs per animation frame, even during high-frequency
  // scroll events.
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const onScroll = () => {
      // Store the latest scrollTop in the ref so the rAF callback always
      // reads the freshest value, even if multiple scroll events fired.
      scrollTopRef.current = el.scrollTop;

      if (!tickingRef.current) {
        requestAnimationFrame(() => {
          // Only update state if the scroll position actually changed.
          // This avoids a no-op re-render when the user hasn't scrolled
          // but a resize or other event triggered the effect.
          setScrollTop((prev) => {
            const next = scrollTopRef.current;
            return prev !== next ? next : prev;
          });
          tickingRef.current = false;
        });
        tickingRef.current = true;
      }
    };

    // Prime with the current value.
    setScrollTop(el.scrollTop);

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
    // elementRef is a stable ref object; the effect only needs to re-run
    // if the underlying element changes (handled via the early return).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── isScrolling flag ───────────────────────────────────────────────
  // Set true on the first scroll change after mount, then clear after a
  // debounce period. Matches masonic's `useScroller` behavior: the flag
  // enables will-change and disables pointer-events during active scroll.
  useEffect(() => {
    if (didMountRef.current === 1) {
      setIsScrolling(true);
    }

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(
      () => {
        setIsScrolling(false);
      },
      40 + 1000 / fps
    );

    didMountRef.current = 1;

    return () => {
      clearTimeout(timeoutRef.current);
    };
  }, [fps, scrollTop]);

  // ── Height + Width tracking via ResizeObserver ─────────────────────
  // useLayoutEffect reads the initial dimensions before the first paint,
  // avoiding a flash where the grid renders at the wrong size.
  //
  // Height updates immediately (masonic viewport sizing needs it).
  // Width is throttled to at most one update per MIN_WIDTH_INTERVAL_MS —
  // this prevents usePositioner from recalculating masonry columns on
  // every animation frame during smooth resizes (e.g. queue panel
  // open/close), while still feeling responsive on manual browser resizes.
  const MIN_WIDTH_INTERVAL_MS = 64; // ~4 frames at 60fps
  const lastWidthUpdateRef = useRef(0);

  useLayoutEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    setHeight(el.clientHeight);
    setWidth(el.clientWidth);

    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setHeight(entry.contentRect.height);

      const now = performance.now();
      if (now - lastWidthUpdateRef.current >= MIN_WIDTH_INTERVAL_MS) {
        lastWidthUpdateRef.current = now;
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { scrollTop, isScrolling, height, width };
}
