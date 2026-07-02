import type { QueuedSong } from '@alfira-bot/server/shared';
import { formatDuration } from '@alfira-bot/server/shared';
import {
  CircleNotchIcon,
  DoorOpenIcon,
  GuitarIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOnceIcon,
  ShuffleIcon,
  SkipForwardIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useQueuePanel } from '../context/QueuePanelContext';
import { BarButton } from './BarButton';
import QueuePanel from './QueuePanel';
import { Button } from './ui/Button';

/* ---------------------------------------------------------------------------
 * Memoized sub-components — these bail out of re-rendering when their props
 * haven't changed, which is most of the time during elapsed-ticking.
 * --------------------------------------------------------------------------- */

interface PlaybackControlsProps {
  currentSong: QueuedSong | null;
  isPaused: boolean;
  isStopped: boolean;
  isPlaying: boolean;
  isConnectedToVoice: boolean;
  pauseBusy: boolean;
  skipBusy: boolean;
  onPauseResume: () => void;
  onSkip: () => void;
  onStop: () => void;
}

const PlaybackControls = memo(function PlaybackControls({
  currentSong,
  isPaused,
  isStopped,
  isPlaying,
  isConnectedToVoice,
  pauseBusy,
  skipBusy,
  onPauseResume,
  onSkip,
  onStop,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
      <BarButton
        onClick={onPauseResume}
        busy={pauseBusy}
        disabled={!currentSong || pauseBusy || skipBusy}
        title={isPaused || isStopped ? 'Resume' : 'Pause'}
        hoverColor="hover:text-fg"
        pulse={isPlaying && !isPaused}
      >
        {isPaused || isStopped ? (
          <PlayIcon size={20} weight="duotone" className="md:w-4.5 md:h-4.5" />
        ) : (
          <PauseIcon size={20} weight="duotone" className="md:w-4.5 md:h-4.5" />
        )}
      </BarButton>
      <BarButton
        onClick={onSkip}
        busy={skipBusy}
        disabled={!currentSong || pauseBusy || skipBusy}
        title="Skip"
        hoverColor="hover:text-fg"
        className="hidden md:flex"
      >
        <SkipForwardIcon size={20} weight="duotone" className="md:w-4.5 md:h-4.5" />
      </BarButton>

      <Button
        variant="inherit"
        surface="base"
        size="icon"
        onClick={onStop}
        disabled={!isConnectedToVoice}
        title="Stop playback"
        className="text-black dark:text-white hover:text-danger"
      >
        <DoorOpenIcon size={20} weight="duotone" className="md:w-4.5 md:h-4.5" />
      </Button>
    </div>
  );
});

interface TimingDisplayProps {
  elapsed: number;
  duration: number;
}

const TimingDisplay = memo(function TimingDisplay({ elapsed, duration }: TimingDisplayProps) {
  return (
    <p className="font-mono text-xs text-muted">
      {formatDuration(elapsed)} / {formatDuration(duration)}
    </p>
  );
});

interface LoopShuffleControlsProps {
  currentSong: QueuedSong | null;
  loopMode: 'off' | 'queue' | 'song';
  isShuffled: boolean;
  loopBusy: boolean;
  shuffleBusy: boolean;
  onCycleLoop: () => void;
  onShuffleToggle: () => void;
}

const LoopShuffleControls = memo(function LoopShuffleControls({
  currentSong,
  loopMode,
  isShuffled,
  loopBusy,
  shuffleBusy,
  onCycleLoop,
  onShuffleToggle,
}: LoopShuffleControlsProps) {
  const isLoopActive = loopMode !== 'off';
  const loopIcon = isLoopActive ? (
    loopMode === 'song' ? (
      <RepeatOnceIcon size={18} weight="fill" className="md:w-4 md:h-4" />
    ) : (
      <RepeatIcon size={18} weight="fill" className="md:w-4 md:h-4" />
    )
  ) : (
    <RepeatIcon size={18} weight="duotone" className="md:w-4 md:h-4" />
  );

  return (
    <div className="hidden md:flex items-center gap-1 md:gap-1.5 shrink-0">
      <Button
        variant="inherit"
        surface="base"
        size="icon"
        onClick={onCycleLoop}
        disabled={!currentSong || loopBusy}
        title={`Loop: ${loopMode}`}
        className={`shrink-0 disabled:opacity-50 ${
          isLoopActive
            ? 'pressed text-accent hover:text-accent-muted'
            : 'text-black dark:text-white hover:text-fg'
        }`}
      >
        {loopBusy ? (
          <CircleNotchIcon size={18} weight="bold" className="animate-spin md:w-4 md:h-4" />
        ) : (
          loopIcon
        )}
      </Button>
      <Button
        variant="inherit"
        surface="base"
        size="icon"
        onClick={onShuffleToggle}
        disabled={!currentSong || shuffleBusy}
        title={isShuffled ? 'Unshuffle queue' : 'Shuffle queue'}
        className={`shrink-0 disabled:opacity-50 ${
          isShuffled
            ? 'pressed text-accent hover:text-accent-muted'
            : 'text-black dark:text-white hover:text-fg'
        }`}
      >
        {shuffleBusy ? (
          <CircleNotchIcon size={18} weight="bold" className="animate-spin md:w-4 md:h-4" />
        ) : (
          <ShuffleIcon
            size={20}
            weight={isShuffled ? 'fill' : 'duotone'}
            className="md:w-4 md:h-4"
          />
        )}
      </Button>
    </div>
  );
});

// Seek-on-release: update visual immediately during drag, but only commit the
// seek API call when the user releases the thumb. This prevents flooding the
// server with seek requests on every pixel of movement and eliminates audio glitches.
interface ScrubberProps {
  isSeekable: boolean;
  duration: number; // seconds
  registerProgress: (ref: HTMLDivElement | null) => void;
  registerThumb: (ref: HTMLDivElement | null) => void;
  onSeek: (seconds: number) => void;
  setOverrideElapsed: (seconds: number) => void;
}

const Scrubber = memo(function Scrubber({
  isSeekable,
  duration,
  registerProgress,
  registerThumb,
  onSeek,
  setOverrideElapsed,
}: ScrubberProps) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // True while the user is dragging the thumb
  const isDraggingRef = useRef(false);
  // Last known slider value during drag (used to commit seek on pointer up)
  const lastDragValueRef = useRef<number>(0);

  // Register the thumb div with the rAF loop so it glides at display-native rate.
  useEffect(() => {
    if (thumbRef.current) {
      registerThumb(thumbRef.current);
    }
  }, [registerThumb]);

  // Position both fill bar and thumb directly in the DOM during drag.
  // Bypasses React + rAF entirely — immediate, jank-free visual feedback.
  const seekElements = useCallback((trackPct: number) => {
    const pctStr = `${trackPct * 100}%`;
    if (fillRef.current) fillRef.current.style.width = pctStr;
    if (thumbRef.current) thumbRef.current.style.left = pctStr;
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const trackPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekSec = Math.round(trackPct * duration);
      lastDragValueRef.current = seekSec;
      setOverrideElapsed(seekSec);
      seekElements(trackPct);
    },
    [duration, setOverrideElapsed, seekElements]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    if (lastDragValueRef.current > 0 || duration > 0) {
      onSeek(lastDragValueRef.current);
    }
  }, [duration, handlePointerMove, onSeek]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isSeekable) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      if (trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        const trackPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const seekSec = Math.round(trackPct * duration);
        lastDragValueRef.current = seekSec;
        setOverrideElapsed(seekSec);
        seekElements(trackPct);
      }
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [isSeekable, duration, handlePointerMove, handlePointerUp, setOverrideElapsed, seekElements]
  );

  if (!isSeekable) {
    return (
      <div className="w-full h-2 clay-inset rounded-full relative overflow-hidden cursor-not-allowed opacity-50">
        <div
          ref={(ref) => {
            fillRef.current = ref;
            registerProgress(ref);
          }}
          className="absolute inset-y-0 left-0 bg-accent rounded-full"
        />
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      className="w-full h-2 clay-inset rounded-full relative cursor-pointer group"
      onPointerDown={handlePointerDown}
    >
      <div
        ref={(ref) => {
          fillRef.current = ref;
          registerProgress(ref);
        }}
        className="absolute inset-y-0 left-0 bg-accent rounded-full"
      />
      {/* Fill & thumb — positioned entirely by useProgressBar (rAF + effect).
           No React style props. */}
      <div
        ref={thumbRef}
        className="scrubber-thumb absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-surface border-2 border-accent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
      />
      {/* Invisible hit area for hovering */}
      <div className="absolute inset-0" />
    </div>
  );
});

interface ProgressBarProps {
  currentSong: QueuedSong | null;
  elapsed: number;
  registerProgress: (ref: HTMLDivElement | null) => void;
  registerThumb: (ref: HTMLDivElement | null) => void;
  onSeek?: (seconds: number) => void;
  setOverrideElapsed: (seconds: number) => void;
  variant: 'mobile' | 'desktop';
}

const ProgressBar = memo(function ProgressBar({
  currentSong,
  elapsed,
  registerProgress,
  registerThumb,
  onSeek,
  setOverrideElapsed,
  variant,
}: ProgressBarProps) {
  // rAF-driven progress bar — width set directly by DOM, no React state
  if (variant === 'mobile') {
    return (
      <div
        className="md:hidden h-1 w-full clay-inset relative overflow-hidden"
        style={{ boxShadow: 'var(--clay-shadow-flat)' }}
      >
        <div
          ref={currentSong != null ? registerProgress : null}
          className="absolute inset-y-0 left-0 bg-accent"
          style={{ width: '0%' }}
        />
      </div>
    );
  }

  const displayName = currentSong ? currentSong.nickname || currentSong.title : '';
  const artist = currentSong?.artist || null;

  return (
    <div className="hidden md:flex flex-col flex-1 items-center xl:items-end self-stretch px-4 min-h-0 gap-1 relative">
      {currentSong ? (
        <div className="text-center w-full truncate xl:text-right h-12 flex flex-col justify-center min-h-12">
          <p className="font-body text-sm font-semibold text-fg truncate">{displayName}</p>
          {artist && <p className="font-body text-xs text-muted truncate">{artist}</p>}
        </div>
      ) : (
        <div className="h-12 shrink-0 flex items-center xl:justify-end justify-center">
          <p className="font-body text-sm text-muted">Nothing playing</p>
        </div>
      )}
      <div className="absolute top-1/2 -translate-y-1/2 left-4">
        <TimingDisplay elapsed={elapsed} duration={currentSong?.duration ?? 0} />
      </div>
      <Scrubber
        isSeekable={currentSong?.isSeekable ?? false}
        duration={currentSong?.duration ?? 0}
        registerProgress={registerProgress}
        registerThumb={registerThumb}
        onSeek={onSeek ?? (() => undefined)}
        setOverrideElapsed={setOverrideElapsed}
      />
    </div>
  );
});

interface AlbumArtProps {
  currentSong: QueuedSong | null;
  isPlaying: boolean;
  isPaused: boolean;
}

const AlbumArt = memo(function AlbumArt({ currentSong, isPlaying, isPaused }: AlbumArtProps) {
  return (
    <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl clay-inset shrink-0 overflow-hidden relative">
      {currentSong && isPlaying && !isPaused && (
        <div className="absolute -top-1.5 -right-1.5 z-10">
          <SparkleIcon size={12} weight="duotone" className="text-accent animate-pulse-gentle" />
        </div>
      )}
      {currentSong ? (
        <img
          src={currentSong.artwork ?? currentSong.thumbnailUrl}
          alt={currentSong.title}
          className="w-full h-full object-cover scale-[1.33]"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <GuitarIcon size={18} weight="duotone" className="text-faint" />
        </div>
      )}
    </div>
  );
});

/* ---------------------------------------------------------------------------
 * Parent component — still re-renders on every tick (reads `elapsed`), but
 * memoized children bail out when their props haven't changed.
 * --------------------------------------------------------------------------- */

export function NowPlayingBar() {
  const {
    state,
    elapsed,
    registerProgress,
    registerThumb,
    skip,
    leave,
    pause,
    setLoop,
    shuffle,
    unshuffle,
    seek,
    setOverrideElapsed,
  } = usePlayer();
  const { currentSong, isPlaying, isPaused, isConnectedToVoice, loopMode, isShuffled } = state;
  const isStopped = !!currentSong && !isPlaying && !isPaused;

  const { queueOpen, setQueueOpen } = useQueuePanel();

  const [pauseBusy, setPauseBusy] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [loopBusy, setLoopBusy] = useState(false);
  const [shuffleBusy, setShuffleBusy] = useState(false);

  const handlePauseResume = useCallback(async () => {
    setPauseBusy(true);
    try {
      await pause();
    } catch (e) {
      console.error(e);
    } finally {
      setPauseBusy(false);
    }
  }, [pause]);

  const handleSkip = useCallback(async () => {
    setSkipBusy(true);
    try {
      await skip();
    } catch (e) {
      console.error(e);
    } finally {
      setSkipBusy(false);
    }
  }, [skip]);

  const handleStop = useCallback(() => {
    leave().catch((e) => console.error(e));
  }, [leave]);

  const handleCycleLoop = useCallback(async () => {
    setLoopBusy(true);
    const next = loopMode === 'off' ? 'queue' : loopMode === 'queue' ? 'song' : 'off';
    try {
      await setLoop(next);
    } finally {
      setLoopBusy(false);
    }
  }, [loopMode, setLoop]);

  const handleShuffleToggle = useCallback(async () => {
    setShuffleBusy(true);
    try {
      if (isShuffled) {
        await unshuffle();
      } else {
        await shuffle();
      }
    } finally {
      setShuffleBusy(false);
    }
  }, [isShuffled, shuffle, unshuffle]);

  const handleSeek = useCallback(
    async (seconds: number) => {
      const positionMs = seconds * 1000;
      await seek(positionMs);
      setOverrideElapsed(seconds);
    },
    [seek, setOverrideElapsed]
  );

  useEffect(() => {
    setOverrideElapsed(undefined);
  }, [setOverrideElapsed]);

  return (
    <div className="shrink-0 w-full bg-base fixed bottom-0 left-0 right-0 z-10">
      {/* Mobile: progress bar on top */}
      <ProgressBar
        currentSong={currentSong}
        registerProgress={registerProgress}
        registerThumb={registerThumb}
        elapsed={elapsed}
        setOverrideElapsed={setOverrideElapsed}
        variant="mobile"
      />

      <div
        className={`h-22 md:h-20 flex flex-row items-center px-3 md:px-5 gap-1 md:gap-1.5 ${!currentSong ? 'justify-end md:justify-start' : ''}`}
      >
        {/* Playback controls: Play/Pause (desktop: also Skip, Leave) */}
        <PlaybackControls
          currentSong={currentSong}
          isPaused={isPaused}
          isStopped={isStopped}
          isPlaying={isPlaying}
          isConnectedToVoice={isConnectedToVoice}
          pauseBusy={pauseBusy}
          skipBusy={skipBusy}
          onPauseResume={handlePauseResume}
          onSkip={handleSkip}
          onStop={handleStop}
        />

        {/* Desktop: centered progress bar */}
        <ProgressBar
          currentSong={currentSong}
          registerProgress={registerProgress}
          registerThumb={registerThumb}
          elapsed={elapsed}
          onSeek={handleSeek}
          setOverrideElapsed={setOverrideElapsed}
          variant="desktop"
        />

        {/* Right-aligned group: metadata, art, queue */}
        <div className="flex items-center ms-auto shrink-0">
          {/* Mobile: metadata (left of art, right-aligned text) */}
          {currentSong ? (
            <div className="md:hidden max-w-32 min-w-0 mr-2">
              <p className="font-body text-sm font-semibold text-fg truncate text-right">
                {currentSong.nickname || currentSong.title}
              </p>
              {currentSong.artist && (
                <p className="font-body text-xs text-muted truncate text-right">
                  {currentSong.artist}
                </p>
              )}
            </div>
          ) : (
            <div className="md:hidden min-w-0 mr-2">
              <p className="font-body text-sm text-muted text-right">Nothing playing</p>
            </div>
          )}

          {/* Album art */}
          <AlbumArt currentSong={currentSong} isPlaying={isPlaying} isPaused={isPaused} />

          {/* Separator */}
          <div className="hidden md:block w-px h-8 md:h-10 bg-border shrink-0 mx-3 md:mx-5" />
          <div className="md:hidden w-px h-8 bg-border shrink-0 mx-1" />

          {/* Queue button (with desktop-only loop/shuffle) */}
          <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
            <LoopShuffleControls
              currentSong={currentSong}
              loopMode={loopMode}
              isShuffled={isShuffled}
              loopBusy={loopBusy}
              shuffleBusy={shuffleBusy}
              onCycleLoop={handleCycleLoop}
              onShuffleToggle={handleShuffleToggle}
            />
            <Button
              variant="inherit"
              surface="base"
              size="icon"
              onClick={() => setQueueOpen(!queueOpen)}
              title="Queue"
              className={`shrink-0 ${
                queueOpen
                  ? 'pressed text-accent hover:text-accent-muted'
                  : 'text-black dark:text-white hover:text-fg'
              }`}
            >
              <QueueIcon size={20} weight="duotone" className="md:w-4 md:h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      {queueOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={() => setQueueOpen(false)}
            role="presentation"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-surface rounded-t-2xl flex flex-col clay-floating animate-slide-up">
            <QueuePanel
              mobileQuickControls={{
                currentSong,
                loopMode,
                isShuffled,
                loopBusy,
                shuffleBusy,
                skipBusy,
                onSkip: handleSkip,
                onCycleLoop: handleCycleLoop,
                onShuffleToggle: handleShuffleToggle,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
