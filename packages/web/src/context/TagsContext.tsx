import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { fetchTags } from '../api/api';

export interface TagItem {
  canonicalName: string;
  nameLower: string;
  color?: string | null;
}

const TagsContext = createContext<{
  tags: TagItem[];
  tagColorMap: Record<string, string | null>;
  refreshTags: () => void;
}>({
  tags: [],
  tagColorMap: {},
  refreshTags: () => {},
});

export function TagsProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [tagColorMap, setTagColorMap] = useState<Record<string, string | null>>({});

  const refreshTags = useCallback(() => {
    void (async () => {
      const fetched: TagItem[] = await fetchTags();
      setTags(fetched);
      const map: Record<string, string | null> = {};
      for (const tag of fetched) {
        map[tag.nameLower] = tag.color ?? null;
      }
      setTagColorMap(map);
    })();
  }, []);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  const value = useMemo(
    () => ({ tags, tagColorMap, refreshTags }),
    [tags, tagColorMap, refreshTags]
  );

  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

export function useTagColors() {
  return useContext(TagsContext);
}
