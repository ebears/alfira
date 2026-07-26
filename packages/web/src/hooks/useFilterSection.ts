import { useEffect, useRef, useState } from 'react';

/**
 * Shared hook for filter section components. Handles three scenarios:
 *
 * 1. User lacks permission (`canManage` is false) — marks loaded immediately.
 * 2. `initialValues` provided (from batched /api/settings/filters fetch) —
 *    seeds state once via the callbacks, then never re-seeds.
 * 3. No `initialValues` — falls back to an individual GET on `endpoint`.
 *
 * Returns `loaded`: true once data is available (or the component gave up).
 *
 * `setValues` and `setSavedValues` must be stable references — React useState
 * setters are guaranteed stable, so passing them directly is safe.
 */
export function useFilterSection<T>(
  canManage: boolean,
  endpoint: string,
  initialValues: T | undefined,
  setValues: (data: T) => void,
  setSavedValues: (data: T) => void
): boolean /* loaded */ {
  const [loaded, setLoaded] = useState(false);
  const didInitRef = useRef(false);

  useEffect(() => {
    if (!canManage) {
      setLoaded(true);
      return;
    }
    if (initialValues !== undefined && !didInitRef.current) {
      setValues(initialValues);
      setSavedValues(initialValues);
      setLoaded(true);
      didInitRef.current = true;
      return;
    }
    if (initialValues !== undefined) {
      return;
    }
    async function load() {
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = (await res.json()) as T;
          setValues(data);
          setSavedValues(data);
        }
      } catch {
        // silently fail — the UI shows stale defaults rather than an error
      } finally {
        setLoaded(true);
      }
    }
    void load();
  }, [canManage, endpoint, initialValues, setValues, setSavedValues]);

  return loaded;
}
