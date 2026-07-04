import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

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

  return (
    <SongMenuContext value={{ activeMenuSongId, setActiveMenuSongId }}>{children}</SongMenuContext>
  );
}

export function useSongMenu() {
  return useContext(SongMenuContext);
}
