import { fetchTags } from '@alfira-bot/server/shared/api';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

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
  refreshTags: () => undefined,
});

export function TagsProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [tagColorMap, setTagColorMap] = useState<Record<string, string | null>>({});

  const refreshTags = useCallback(() => {
    fetchTags().then((fetched: TagItem[]) => {
      setTags(fetched);
      const map: Record<string, string | null> = {};
      for (const tag of fetched) {
        map[tag.nameLower] = tag.color ?? null;
      }
      setTagColorMap(map);
    });
  }, []);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  return (
    <TagsContext.Provider value={{ tags, tagColorMap, refreshTags }}>
      {children}
    </TagsContext.Provider>
  );
}

export function useTagColors() {
  return useContext(TagsContext);
}
