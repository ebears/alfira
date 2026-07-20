import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const CLOSE_DURATION_MS = 300;

const SongEditContext = createContext<{
  openSongId: string | null;
  closingSongId: string | null;
  setOpenSongId: (id: string | null) => void;
}>({
  openSongId: null,
  closingSongId: null,
  setOpenSongId: () => {
    /* noop */
  },
});

export function SongEditProvider({ children }: { children: ReactNode }) {
  const [openSongId, setOpenSongId] = useState<string | null>(null);
  const [closingSongId, setClosingSongId] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const setOpenSongIdSequenced = useCallback(
    (id: string | null) => {
      if (closeTimerRef.current != null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      if (id == null) {
        // Closing without opening a new song
        if (openSongId != null) {
          setClosingSongId(openSongId);
          setOpenSongId(null);
          closeTimerRef.current = window.setTimeout(
            () => setClosingSongId(null),
            CLOSE_DURATION_MS
          );
        }
        return;
      }

      if (id === openSongId) {
        // Toggling off the same song
        setClosingSongId(id);
        setOpenSongId(null);
        closeTimerRef.current = window.setTimeout(() => setClosingSongId(null), CLOSE_DURATION_MS);
        return;
      }

      // Switching to a different song: open new immediately while old closes
      if (openSongId != null) {
        setClosingSongId(openSongId);
        setOpenSongId(id);
        closeTimerRef.current = window.setTimeout(() => setClosingSongId(null), CLOSE_DURATION_MS);
      } else if (closingSongId != null) {
        // Previous song is still closing; keep it closing, just open the new one
        setOpenSongId(id);
      } else {
        setOpenSongId(id);
      }
    },
    [openSongId, closingSongId]
  );

  // Close panel when clicking outside any song edit container
  useEffect(() => {
    if (openSongId == null) {
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-song-edit-container]')) {
        setOpenSongIdSequenced(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openSongId, setOpenSongIdSequenced]);

  const value = useMemo(
    () => ({ openSongId, closingSongId, setOpenSongId: setOpenSongIdSequenced }),
    [openSongId, closingSongId, setOpenSongIdSequenced]
  );

  return <SongEditContext value={value}>{children}</SongEditContext>;
}

export function useSongEdit() {
  return useContext(SongEditContext);
}
