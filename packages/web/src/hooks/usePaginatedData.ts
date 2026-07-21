import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePaginatedDataOptions<T, A extends unknown[], M = undefined> {
  fetchPage: (
    page: number,
    limit: number,
    ...args: A
  ) => Promise<{ items: T[]; hasMore: boolean; total?: number; metadata?: M }>;
  limit?: number;
  deps?: A;
  /**
   * Optional comparator for sorting items after real-time mutations (prepend / updateItem).
   * Without this, updated items stay at their old array position even when the current
   * sort order would place them elsewhere.
   */
  compareFn?: (a: T, b: T) => number;
}

export interface UsePaginatedDataReturn<T, M = undefined> {
  items: T[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  total: number;
  hasLoaded: boolean;
  metadata: M | undefined;
  fetchNextPage: () => void;
  prepend: (item: T) => void;
  updateItem: (item: T) => void;
  removeItem: (id: string) => void;
  reset: () => void;
  refetch: () => void;
  retry: () => void;
}

export function usePaginatedData<T, A extends unknown[], M = undefined>({
  fetchPage,
  limit = 48,
  deps = [] as unknown as A,
  compareFn,
}: UsePaginatedDataOptions<T, A, M>): UsePaginatedDataReturn<T, M> {
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

  // Detect dep changes synchronously during render so we can suppress
  // stale empty states before the effect fires. Without this, there's a
  // one-frame gap where the new tab's emptyTitle renders against the old
  // (empty) items before isFetching is set to true in the effect.
  const prevDepsRef = useRef<A>(deps);
  const depsChanged =
    hasEverLoadedRef.current &&
    (prevDepsRef.current.length !== deps.length ||
      prevDepsRef.current.some((d, i) => d !== deps[i]));
  prevDepsRef.current = deps;

  const effectiveIsFetching = isFetching || depsChanged;

  const compareFnRef = useRef(compareFn);
  compareFnRef.current = compareFn;

  const loadPage = useCallback(
    async (page: number, isInitial = false) => {
      if (isFetchingRef.current) {
        return;
      }
      if (!isInitial && !hasMoreRef.current) {
        return;
      }

      if (isInitial) {
        resetInProgressRef.current = true;
        // Delay the skeleton by 200ms — if the fetch completes faster,
        // the skeleton is never rendered, avoiding a flash.
        loadingTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setIsLoading(true);
          }
        }, 200);
        // On dep-change re-fetches, signal immediately that we're fetching
        // so the empty-state guard can suppress stale empty messages from
        // the previous deps (e.g. "No Pending Requests" when switching to
        // History). First-ever loads don't need this — hasLoaded is still
        // false, so the empty state is already suppressed.
        if (hasEverLoadedRef.current) {
          setIsFetching(true);
        }
      } else {
        setIsFetching(true);
      }
      setIsError(false);

      try {
        const result = await fetchPageRef.current(page, limit, ...depsRef.current);
        if (!isMountedRef.current) {
          return;
        }

        hasEverLoadedRef.current = true;

        if (isInitial) {
          setItems(result.items);
          setHasMore(result.hasMore);
          if (result.total !== undefined) {
            setTotal(result.total);
          }
          if (result.metadata !== undefined) {
            setMetadata(result.metadata);
          }
          pageRef.current = 1;
        } else {
          setItems((prev) => [...prev, ...result.items]);
          setHasMore(result.hasMore);
          pageRef.current = page;
        }
      } catch {
        if (!isMountedRef.current) {
          return;
        }
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

  const fetchNextPage = useCallback(() => {
    if (!hasMoreRef.current || isFetchingRef.current || resetInProgressRef.current) {
      return;
    }
    const nextPage = pageRef.current + 1;
    void loadPage(nextPage);
  }, [loadPage]);

  const retry = useCallback(() => {
    setIsError(false);
    const nextPage = pageRef.current + 1;
    void loadPage(nextPage);
  }, [loadPage]);

  const prepend = useCallback((item: T) => {
    if (resetInProgressRef.current) {
      return;
    }
    setItems((prev) => {
      if (prev.some((i) => (i as { id: string }).id === (item as { id: string }).id)) {
        return prev;
      }
      const next = [item, ...prev];
      if (compareFnRef.current) {
        next.sort(compareFnRef.current);
      }
      return next;
    });
  }, []);

  const updateItem = useCallback((item: T) => {
    if (resetInProgressRef.current) {
      return;
    }
    setItems((prev) => {
      const next = prev.map((i) =>
        (i as { id: string }).id === (item as { id: string }).id ? item : i
      );
      if (compareFnRef.current) {
        next.sort(compareFnRef.current);
      }
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    if (resetInProgressRef.current) {
      return;
    }
    setItems((prev) => prev.filter((i) => (i as { id: string }).id !== id));
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setMetadata(undefined);
    pageRef.current = 1;
    setHasMore(true);
    setIsError(false);
    void loadPage(1, true);
  }, [loadPage]);

  const refetch = useCallback(() => {
    if (resetInProgressRef.current) {
      return;
    }
    setIsFetching(true);
    setIsError(false);
    void (async () => {
      try {
        const result = await fetchPageRef.current(1, limit, ...depsRef.current);
        if (!isMountedRef.current) {
          return;
        }
        setItems(result.items);
        setHasMore(result.hasMore);
        if (result.total !== undefined) {
          setTotal(result.total);
        }
        if (result.metadata !== undefined) {
          setMetadata(result.metadata);
        }
        pageRef.current = 1;
      } catch {
        if (!isMountedRef.current) {
          return;
        }
        setIsError(true);
      }
      if (isMountedRef.current) {
        setIsFetching(false);
      }
    })();
  }, [limit]);

  // Initial load
  const depsArray = [...deps, loadPage];
  useEffect(() => {
    isMountedRef.current = true;
    void loadPage(1, true);

    return () => {
      isMountedRef.current = false;
      resetInProgressRef.current = false;
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally depends on deps to refetch on search change; loadPage is stable via ref
  }, depsArray);

  return {
    items,
    metadata,
    isLoading,
    isFetching: effectiveIsFetching,
    isError,
    hasMore,
    total,
    hasLoaded,
    fetchNextPage,
    prepend,
    updateItem,
    removeItem,
    reset,
    refetch,
    retry,
  };
}
