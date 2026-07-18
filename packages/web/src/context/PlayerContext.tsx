import type { LoopMode, QueueState } from '@alfira/server/shared';
import {
  clearQueue,
  demoteQueueSong,
  fetchQueueState,
  leaveVoice,
  promoteQueueSong,
  removeQueueSong,
  reorderQueueSongs,
  seek as seekTrack,
  setLoopMode,
  shuffleQueue,
  skipTrack,
  togglePause,
  unshuffleQueue,
} from '@alfira/server/shared/api';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useProgressBar } from '../hooks/useProgressBar';
import { disposeSocket, onSocketEvent, useConnectionStatus, useSocket } from '../hooks/useSocket';

// ---------------------------------------------------------------------------
// Default empty state — used before the first fetch completes.
// ---------------------------------------------------------------------------
const EMPTY_STATE: QueueState = {
  isPlaying: false,
  isPaused: false,
  isConnectedToVoice: false,
  loopMode: 'off',
  isShuffled: false,
  currentSong: null,
  priorityQueue: [],
  queue: [],
  trackStartedAt: null,
  nextTrack: null,
  compressorSettings: null,
};

interface PlayerContextValue {
  state: QueueState;
  loading: boolean;
  // Elapsed seconds for the current song (client-side simulation).
  elapsed: number;
  // Register a progress bar DOM element for direct rAF-driven updates.
  registerProgress: (ref: HTMLDivElement | null) => void;
  // Register a thumb div whose position tracks progress at rAF speed.
  registerThumb: (ref: HTMLDivElement | null) => void;
  // Override elapsed time (e.g. after a seek).
  setOverrideElapsed: (elapsed: number | undefined) => void;
  // Actions — each calls the API; state updates arrive via real-time events.
  skip: () => Promise<void>;
  /** Stop playback, clear the queue, and disconnect the bot from voice. */
  leave: () => Promise<void>;
  pause: () => Promise<void>;
  clear: () => Promise<void>;
  setLoop: (mode: LoopMode) => Promise<void>;
  shuffle: () => Promise<void>;
  unshuffle: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  removeSong: (songId: string) => Promise<void>;
  promoteSong: (songId: string) => Promise<void>;
  demoteSong: (songId: string) => Promise<void>;
  reorderQueue: (songIds: string[], target?: 'queue' | 'priority') => Promise<void>;
  // Force an immediate REST refetch (e.g. after starting playback from QueuePage).
  refetch: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Split contexts to isolate the 1-second re-render cascade.
// PlayerStateContext changes only when the player state or actions change
// (skip, pause, etc.). PlayerElapsedContext changes every second during
// playback but is consumed only by NowPlayingBar and QueuePanel.
// ---------------------------------------------------------------------------
const PlayerStateContext = createContext<Omit<
  PlayerContextValue,
  'elapsed' | 'registerProgress' | 'registerThumb'
> | null>(null);
const PlayerElapsedContext = createContext<number>(0);
const PlayerProgressContext = createContext<(ref: HTMLDivElement | null) => void>(() => {
  /* noop */
});
const PlayerThumbContext = createContext<(ref: HTMLDivElement | null) => void>(() => {
  /* noop */
});
const PlayerOverrideContext = createContext<(elapsed: number | undefined) => void>(() => {
  /* noop */
});

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QueueState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [overrideElapsed, setOverrideElapsed] = useState<number | undefined>(undefined);
  // Initialize the WebSocket connection (singleton, safe to call on every render).
  useSocket();

  // Use the progress bar hook (rAF + 1-sec interval)
  const { elapsed, registerProgress, registerThumb } = useProgressBar(
    state,
    overrideElapsed,
    setOverrideElapsed
  );

  // ---------------------------------------------------------------------------
  // REST fetch — used for initial load and after actions where we want the
  // freshest server state immediately (e.g. after starting playback).
  // ---------------------------------------------------------------------------
  const refetch = useCallback(async () => {
    try {
      const data = await fetchQueueState();
      setState(data);
    } catch {
      // Silently retry on next socket connect or manual refetch
    } finally {
      setLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Real-time events — primary state update mechanism.
  //
  // On connect (and reconnect), always fetch the current state via REST to
  // avoid a stale snapshot for users who open the page mid-song. After that,
  // player:update events keep the state in sync without polling.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Fetch immediately when the context mounts.
    refetch();

    const handlePlayerUpdate = (data: QueueState) => {
      setState(data);
      // Mark loading as false on the first real-time update too, in case
      // the REST fetch hasn't resolved yet.
      setLoading(false);
    };

    const offPlayerUpdate = onSocketEvent('player:update', handlePlayerUpdate);

    return () => {
      offPlayerUpdate();
    };
  }, [refetch]);

  // Re-sync via REST whenever the WebSocket reconnects.
  const connectionStatus = useConnectionStatus();
  useEffect(() => {
    if (connectionStatus === 'connected') {
      refetch();
    }
  }, [connectionStatus, refetch]);

  // ---------------------------------------------------------------------------
  // Cleanup — disconnect the socket when the provider unmounts.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      disposeSocket();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Action helpers
  //
  // Each action calls the API. Socket player:update events keep state in sync.
  // ---------------------------------------------------------------------------
  const skip = useCallback(async () => {
    await skipTrack();
  }, []);

  const leave = useCallback(async () => {
    await leaveVoice();
  }, []);

  const pause = useCallback(async () => {
    await togglePause();
  }, []);

  const clear = useCallback(async () => {
    await clearQueue();
  }, []);

  const setLoop = useCallback(async (mode: LoopMode) => {
    await setLoopMode(mode);
  }, []);

  const shuffle = useCallback(async () => {
    await shuffleQueue();
  }, []);

  const unshuffle = useCallback(async () => {
    await unshuffleQueue();
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    await seekTrack(positionMs);
  }, []);

  const removeSong = useCallback(async (songId: string) => {
    await removeQueueSong(songId);
  }, []);

  const promoteSong = useCallback(async (songId: string) => {
    await promoteQueueSong(songId);
  }, []);

  const demoteSong = useCallback(async (songId: string) => {
    await demoteQueueSong(songId);
  }, []);

  const reorderQueue = useCallback(async (songIds: string[], target?: 'queue' | 'priority') => {
    await reorderQueueSongs(songIds, target);
  }, []);

  const stateValue: Omit<PlayerContextValue, 'elapsed' | 'registerProgress' | 'registerThumb'> =
    useMemo(
      () => ({
        state,
        loading,
        skip,
        leave,
        pause,
        clear,
        setLoop,
        shuffle,
        unshuffle,
        seek,
        removeSong,
        promoteSong,
        demoteSong,
        reorderQueue,
        refetch,
        setOverrideElapsed,
      }),
      [
        state,
        loading,
        skip,
        leave,
        pause,
        clear,
        setLoop,
        shuffle,
        unshuffle,
        seek,
        removeSong,
        promoteSong,
        demoteSong,
        reorderQueue,
        refetch,
      ]
    );

  return (
    <PlayerStateContext value={stateValue}>
      <PlayerProgressContext value={registerProgress}>
        <PlayerThumbContext value={registerThumb}>
          <PlayerOverrideContext.Provider value={setOverrideElapsed}>
            <PlayerElapsedContext value={elapsed}>{children}</PlayerElapsedContext>
          </PlayerOverrideContext.Provider>
        </PlayerThumbContext>
      </PlayerProgressContext>
    </PlayerStateContext>
  );
}

/**
 * Returns only the player state and actions — does NOT re-render when elapsed
 * ticks every second. Use this in pages (SongsPage, PlaylistsPage, etc.) that
 * need queue state (e.g. loopMode) but don't care about elapsed.
 */
export function usePlayerState(): Omit<
  PlayerContextValue,
  'elapsed' | 'registerProgress' | 'registerThumb'
> {
  const context = useContext(PlayerStateContext);
  if (!context) {
    throw new Error('usePlayerState must be used within a PlayerProvider');
  }
  return context;
}

/**
 * Full player context including elapsed and registerProgress. This
 * re-renders every second during playback. Use only in NowPlayingBar
 * and QueuePanel.
 */
export function usePlayer(): PlayerContextValue {
  const stateContext = useContext(PlayerStateContext);
  const elapsed = useContext(PlayerElapsedContext);
  const registerProgress = useContext(PlayerProgressContext);
  const registerThumb = useContext(PlayerThumbContext);
  const setOverrideElapsed = useContext(PlayerOverrideContext);
  if (!stateContext) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return { ...stateContext, elapsed, registerProgress, registerThumb, setOverrideElapsed };
}
