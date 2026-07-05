import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseInfiniteScrollOptions<T, A extends unknown[], M = undefined> {
  fetchPage: (
    page: number,
    limit: number,
    ...args: A
  ) => Promise<{ items: T[]; hasMore: boolean; total?: number; metadata?: M }>;
  limit?: number;
  deps?: A;
}

export interface UseInfiniteScrollReturn<T, M = undefined> {
  items: T[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  total: number;
  hasLoaded: boolean;
  metadata: M | undefined;
  prepend: (item: T) => void;
  updateItem: (item: T) => void;
  removeItem: (id: string) => void;
  reset: (searchQuery?: string) => void;
  refetch: () => void;
  retry: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
}

export function useVirtualizedInfiniteScroll<T, A extends unknown[], M = undefined>({
  fetchPage,
  limit = 24,
  deps = [] as unknown as A,
}: UseInfiniteScrollOptions<T, A, M>): UseInfiniteScrollReturn<T, M> {
  const [items, setItems] = useState<T[]>([]);
  const [metadata, setMetadata] = useState<M | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);
  const hasEverLoadedRef = useRef(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resetInProgressRef = useRef(false);

  hasMoreRef.current = hasMore;
  isFetchingRef.current = isFetching;

  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const depsRef = useRef(deps);
  depsRef.current = deps;

  const sentinelRefInternal = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Initial value is a no-op; immediately overwritten after render
  // biome-ignore lint/suspicious/noEmptyBlockStatements: initial no-op value is immediately replaced
  const fetchMoreFnRef = useRef<() => void>(() => {});

  const loadPage = useCallback(
    async (page: number, isInitial = false, searchOverride?: string) => {
      if (isFetchingRef.current) return;
      if (!isInitial && !hasMoreRef.current) return;

      if (isInitial) {
        resetInProgressRef.current = true;
        // Delay the skeleton by 200ms — if the fetch completes faster,
        // the skeleton is never rendered, avoiding a flash.
        // On subsequent deps changes (tab switch, filter change), keep
        // stale items visible instead.
        if (!hasEverLoadedRef.current) {
          loadingTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setIsLoading(true);
            }
          }, 200);
        }
      } else {
        setIsFetching(true);
      }
      setIsError(false);

      const searchArgs = (searchOverride !== undefined ? [searchOverride] : depsRef.current) as A;

      try {
        const result = await fetchPageRef.current(page, limit, ...searchArgs);
        if (!isMountedRef.current) return;

        hasEverLoadedRef.current = true;

        if (isInitial) {
          setItems(result.items);
          setHasMore(result.hasMore);
          if (result.total !== undefined) setTotal(result.total);
          if (result.metadata !== undefined) setMetadata(result.metadata);
          pageRef.current = 1;
        } else {
          setItems((prev) => [...prev, ...result.items]);
          setHasMore(result.hasMore);
          pageRef.current = page;
        }
      } catch {
        if (!isMountedRef.current) return;
        setIsError(true);
      } finally {
        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = undefined;
        }
        resetInProgressRef.current = false;
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsFetching(false);
          setHasLoaded(true);
        }
      }
    },
    [limit]
  );

  const fetchMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingRef.current || resetInProgressRef.current) return;
    const nextPage = pageRef.current + 1;
    void loadPage(nextPage);
  }, [loadPage]);

  fetchMoreFnRef.current = fetchMore;

  const retry = useCallback(() => {
    setIsError(false);
    const nextPage = pageRef.current + 1;
    void loadPage(nextPage);
  }, [loadPage]);

  const prepend = useCallback((item: T) => {
    if (resetInProgressRef.current) return;
    setItems((prev) => {
      if (prev.some((i) => (i as { id: string }).id === (item as { id: string }).id)) return prev;
      return [item, ...prev];
    });
  }, []);

  const updateItem = useCallback((item: T) => {
    if (resetInProgressRef.current) return;
    setItems((prev) =>
      prev.map((i) => ((i as { id: string }).id === (item as { id: string }).id ? item : i))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    if (resetInProgressRef.current) return;
    setItems((prev) => prev.filter((i) => (i as { id: string }).id !== id));
  }, []);

  const reset = useCallback(
    (searchQuery?: string) => {
      setItems([]);
      setMetadata(undefined);
      pageRef.current = 1;
      setHasMore(true);
      setIsError(false);
      void loadPage(1, true, searchQuery);
    },
    [loadPage]
  );

  const refetch = useCallback(() => {
    if (resetInProgressRef.current) return;
    setIsFetching(true);
    setIsError(false);
    const searchArgs = depsRef.current as A;
    fetchPageRef
      .current(1, limit, ...searchArgs)
      .then((result) => {
        if (!isMountedRef.current) return;
        setItems(result.items);
        setHasMore(result.hasMore);
        if (result.total !== undefined) setTotal(result.total);
        if (result.metadata !== undefined) setMetadata(result.metadata);
        pageRef.current = 1;
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setIsError(true);
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsFetching(false);
        }
      });
  }, [limit]);

  // Initial load
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally depends on deps to refetch on search change; loadPage is stable via ref
  useEffect(() => {
    isMountedRef.current = true;
    void loadPage(1, true, deps[0] as string | undefined);

    return () => {
      isMountedRef.current = false;
      resetInProgressRef.current = false;
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = undefined;
      }
    };
  }, [...deps, loadPage]);

  // IntersectionObserver — created once, reads fetchMore via ref so it never goes stale
  const setSentinelRef = useCallback((el: HTMLDivElement | null) => {
    if (sentinelRefInternal.current === el) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    sentinelRefInternal.current = el;

    if (!el) return;

    observerRef.current = new IntersectionObserver(
      () => {
        fetchMoreFnRef.current();
      },
      { rootMargin: '300px' }
    );

    observerRef.current.observe(el);
  }, []); // intentionally empty — reads fetchMore via ref

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return {
    items,
    metadata,
    isLoading,
    isFetching,
    isError,
    hasMore,
    total,
    hasLoaded,
    prepend,
    updateItem,
    removeItem,
    reset,
    refetch,
    retry,
    sentinelRef: setSentinelRef,
  };
}
