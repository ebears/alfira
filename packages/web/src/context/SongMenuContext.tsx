import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

const SongMenuContext = createContext<{
  activeMenuSongId: string | null;
  setActiveMenuSongId: (id: string | null) => void;
}>({
  activeMenuSongId: null,
  setActiveMenuSongId: () => {
    /* noop */
  },
});

export function SongMenuProvider({ children }: { children: ReactNode }) {
  const [activeMenuSongId, setActiveMenuSongIdState] = useState<string | null>(null);

  const setActiveMenuSongId = useCallback((id: string | null) => {
    setActiveMenuSongIdState(id);
  }, []);

  const value = useMemo(
    () => ({ activeMenuSongId, setActiveMenuSongId }),
    [activeMenuSongId, setActiveMenuSongId]
  );

  return <SongMenuContext value={value}>{children}</SongMenuContext>;
}

export function useSongMenu() {
  return useContext(SongMenuContext);
}
