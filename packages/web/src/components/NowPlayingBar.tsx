import type { QueuedSong } from '@alfira/server/shared';
import { formatDuration } from '@alfira/server/shared';
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
} from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useQueuePanel } from '../context/QueuePanelContext';
import { useCooldownGuard } from '../hooks/useCooldownGuard';
import { useNotification } from '../hooks/useNotification';
import { apiErrorMessage, isRateLimitError } from '../utils/api';
import { getSourceKey } from '../utils/source';
import { BarButton } from './BarButton';
import QueuePanel from './QueuePanel';
import { SourceIcon } from './SourceIcons';
import TagTicker from './TagTicker';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import { VolumeBoostBadge } from './ui/VolumeBoostBadge';

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
  coolingDown: boolean;
  statusTitle: string | undefined;
  onPauseResume: () => void;
  onSkip: () => void;
  onStop: () => void;
  onCooldownClick: () => void;
}

const PlaybackControls = memo(function PlaybackControls({
  currentSong,
  isPaused,
  isStopped,
  isPlaying,
  isConnectedToVoice,
  pauseBusy,
  skipBusy,
  coolingDown,
  statusTitle,
  onPauseResume,
  onSkip,
  onStop,
  onCooldownClick,
}: PlaybackControlsProps) {
  const realDisabled = !currentSong || pauseBusy || skipBusy;

  return (
    <div className='flex items-center gap-1 md:gap-1.5 shrink-0'>
      <BarButton
        onClick={coolingDown ? onCooldownClick : onPauseResume}
        busy={pauseBusy}
        disabled={realDisabled}
        dimmed={coolingDown}
        title={statusTitle ?? (isPaused || isStopped ? 'Play' : 'Pause')}
        hoverColor='hover:text-fg'
        pulse={isPlaying && !isPaused}
      >
        {isPaused || isStopped ? (
          <PlayIcon size={24} weight='duotone' className='md:w-5 md:h-5' />
        ) : (
          <PauseIcon size={24} weight='duotone' className='md:w-5 md:h-5' />
        )}
      </BarButton>
      <BarButton
        onClick={coolingDown ? onCooldownClick : onSkip}
        busy={skipBusy}
        disabled={realDisabled}
        dimmed={coolingDown}
        title={statusTitle ?? 'Skip'}
        hoverColor='hover:text-fg'
        className='hidden md:flex'
      >
        <SkipForwardIcon size={24} weight='duotone' className='md:w-5 md:h-5' />
      </BarButton>

      <Button
        variant='inherit'
        surface='base'
        size='icon'
        onClick={coolingDown ? onCooldownClick : onStop}
        disabled={!isConnectedToVoice}
        dimmed={coolingDown}
        title={statusTitle ?? 'Stop playback'}
        className='text-black dark:text-white hover:text-danger md:w-12 md:h-12'
      >
        <DoorOpenIcon size={24} weight='duotone' className='md:w-5 md:h-5' />
      </Button>
    </div>
  );
});

interface LoopShuffleControlsProps {
  currentSong: QueuedSong | null;
  loopMode: 'off' | 'queue' | 'song';
  isShuffled: boolean;
  loopBusy: boolean;
  shuffleBusy: boolean;
  coolingDown: boolean;
  statusTitle: string | undefined;
  onCycleLoop: () => void;
  onShuffleToggle: () => void;
  onCooldownClick: () => void;
}

const LoopShuffleControls = memo(function LoopShuffleControls({
  currentSong,
  loopMode,
  isShuffled,
  loopBusy,
  shuffleBusy,
  coolingDown,
  statusTitle,
  onCycleLoop,
  onShuffleToggle,
  onCooldownClick,
}: LoopShuffleControlsProps) {
  const isLoopActive = loopMode !== 'off';
  const loopIcon = isLoopActive ? (
    loopMode === 'song' ? (
      <RepeatOnceIcon size={22} weight='fill' className='md:w-5 md:h-5' />
    ) : (
      <RepeatIcon size={22} weight='fill' className='md:w-5 md:h-5' />
    )
  ) : (
    <RepeatIcon size={22} weight='duotone' className='md:w-5 md:h-5' />
  );

  return (
    <div className='hidden md:flex items-center gap-1 md:gap-1.5 shrink-0'>
      <Button
        variant='inherit'
        surface='base'
        size='icon'
        onClick={coolingDown ? onCooldownClick : onCycleLoop}
        disabled={!currentSong || loopBusy}
        dimmed={coolingDown}
        title={statusTitle ?? `Loop: ${loopMode}`}
        className={`shrink-0 md:w-12 md:h-12 ${
          isLoopActive
            ? 'pressed text-accent hover:text-accent-muted'
            : 'text-black dark:text-white hover:text-fg'
        }`}
      >
        {loopBusy ? (
          <CircleNotchIcon size={22} weight='bold' className='animate-spin md:w-5 md:h-5' />
        ) : (
          loopIcon
        )}
      </Button>
      <Button
        variant='inherit'
        surface='base'
        size='icon'
        onClick={coolingDown ? onCooldownClick : onShuffleToggle}
        disabled={!currentSong || shuffleBusy}
        dimmed={coolingDown}
        title={statusTitle ?? (isShuffled ? 'Unshuffle queue' : 'Shuffle queue')}
        className={`shrink-0 md:w-12 md:h-12 ${
          isShuffled
            ? 'pressed text-accent hover:text-accent-muted'
            : 'text-black dark:text-white hover:text-fg'
        }`}
      >
        {shuffleBusy ? (
          <CircleNotchIcon size={22} weight='bold' className='animate-spin md:w-5 md:h-5' />
        ) : (
          <ShuffleIcon
            size={24}
            weight={isShuffled ? 'fill' : 'duotone'}
            className='md:w-5 md:h-5'
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
      <div className='w-full h-2 clay-inset rounded-full relative overflow-hidden cursor-not-allowed opacity-50'>
        <div
          ref={(ref) => {
            fillRef.current = ref;
            registerProgress(ref);
          }}
          className='absolute inset-y-0 left-0 bg-accent rounded-full'
        />
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      className='w-full h-2 clay-inset rounded-full relative cursor-pointer group'
      onPointerDown={handlePointerDown}
    >
      <div
        ref={(ref) => {
          fillRef.current = ref;
          registerProgress(ref);
        }}
        className='absolute inset-y-0 left-0 bg-accent rounded-full'
      />
      {/* Fill & thumb — positioned entirely by useProgressBar (rAF + effect).
           No React style props. */}
      <div
        ref={(ref) => {
          thumbRef.current = ref;
          if (ref) registerThumb(ref);
        }}
        className='scrubber-thumb absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-surface border-2 border-accent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity'
      />
      {/* Invisible hit area for hovering */}
      <div className='absolute inset-0' />
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
        className='md:hidden h-1 w-full clay-inset relative overflow-hidden'
        style={{ boxShadow: 'var(--clay-shadow-flat)' }}
      >
        <div
          ref={currentSong != null ? registerProgress : null}
          className='absolute inset-y-0 left-0 bg-accent'
          style={{ width: '0%' }}
        />
      </div>
    );
  }

  return (
    <div className='hidden md:flex items-center flex-1 min-h-0'>
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
}

const AlbumArt = memo(function AlbumArt({ currentSong }: AlbumArtProps) {
  return (
    <div className='w-12 h-12 md:w-14 md:h-14 rounded border border-border shrink-0 overflow-hidden relative bg-elevated'>
      {currentSong ? (
        <ArtworkImage
          src={currentSong.artwork ?? currentSong.thumbnailUrl}
          alt={currentSong.title}
          className='w-full h-full'
          imageClassName='scale-[1.33]'
        />
      ) : (
        <div className='w-full h-full flex items-center justify-center'>
          <GuitarIcon size={18} weight='duotone' className='text-faint' />
        </div>
      )}
    </div>
  );
});

interface MetadataSectionProps {
  currentSong: QueuedSong | null;
  elapsed: number;
}

const MetadataSection = memo(function MetadataSection({
  currentSong,
  elapsed,
}: MetadataSectionProps) {
  if (!currentSong) {
    return (
      <div className='flex items-center h-6'>
        <p className='font-body text-sm text-muted'>Nothing playing</p>
      </div>
    );
  }

  const displayName = currentSong.nickname || currentSong.title;
  const sourceKey = getSourceKey(currentSong.sourceUrl);

  return (
    <div className='flex flex-col min-w-0 gap-0.5'>
      <div className='flex items-center gap-2 min-w-0'>
        <p className='font-body text-sm font-medium text-fg truncate'>{displayName}</p>
        {currentSong.artist && (
          <p className='font-body text-xs text-muted shrink-0'>· {currentSong.artist}</p>
        )}
        <TagTicker tags={currentSong.tags ?? []} />
      </div>
      <div className='flex items-center gap-2'>
        <p className='font-mono text-xs text-muted'>
          {formatDuration(elapsed)} / {formatDuration(currentSong.duration)}
        </p>
        {sourceKey && (
          <span className='flex items-center shrink-0 [&_svg]:w-3 [&_svg]:h-3'>
            <SourceIcon sourceKey={sourceKey} />
          </span>
        )}
        <VolumeBoostBadge volumeBoost={currentSong.volumeBoost} />
      </div>
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

  const { notify } = useNotification();
  const { coolingDown, statusTitle, handleCooldownClick } = useCooldownGuard();

  // Refs provide synchronous guards against rapid clicks bypassing state-based
  // disabled. React state updates are async, so fast clicks can fire multiple
  // handlers before the DOM re-renders with disabled={true}.
  const pauseBusyRef = useRef(false);
  const skipBusyRef = useRef(false);
  const loopBusyRef = useRef(false);
  const shuffleBusyRef = useRef(false);

  const handlePauseResume = useCallback(async () => {
    if (pauseBusyRef.current) return;
    pauseBusyRef.current = true;
    setPauseBusy(true);
    try {
      await pause();
    } catch (err) {
      if (!isRateLimitError(err)) {
        notify(apiErrorMessage(err, 'Could not toggle playback.'), 'error', 5000);
      }
    } finally {
      pauseBusyRef.current = false;
      setPauseBusy(false);
    }
  }, [pause, notify]);

  const handleSkip = useCallback(async () => {
    if (skipBusyRef.current) return;
    skipBusyRef.current = true;
    setSkipBusy(true);
    try {
      await skip();
    } catch (err) {
      if (!isRateLimitError(err)) {
        notify(apiErrorMessage(err, 'Could not skip track.'), 'error', 5000);
      }
    } finally {
      skipBusyRef.current = false;
      setSkipBusy(false);
    }
  }, [skip, notify]);

  const handleStop = useCallback(() => {
    leave().catch((e) => console.error(e));
  }, [leave]);

  const handleCycleLoop = useCallback(async () => {
    if (loopBusyRef.current) return;
    loopBusyRef.current = true;
    setLoopBusy(true);
    const next = loopMode === 'off' ? 'queue' : loopMode === 'queue' ? 'song' : 'off';
    try {
      await setLoop(next);
    } catch (err) {
      if (!isRateLimitError(err)) {
        notify(apiErrorMessage(err, 'Could not change loop mode.'), 'error', 5000);
      }
    } finally {
      loopBusyRef.current = false;
      setLoopBusy(false);
    }
  }, [loopMode, setLoop, notify]);

  const handleShuffleToggle = useCallback(async () => {
    if (shuffleBusyRef.current) return;
    shuffleBusyRef.current = true;
    setShuffleBusy(true);
    try {
      if (isShuffled) {
        await unshuffle();
      } else {
        await shuffle();
      }
    } catch (err) {
      if (!isRateLimitError(err)) {
        notify(apiErrorMessage(err, 'Could not toggle shuffle.'), 'error', 5000);
      }
    } finally {
      shuffleBusyRef.current = false;
      setShuffleBusy(false);
    }
  }, [isShuffled, shuffle, unshuffle, notify]);

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
    <div className='shrink-0 w-full bg-base fixed bottom-0 left-0 right-0 z-10'>
      {/* Mobile: progress bar on top */}
      <ProgressBar
        currentSong={currentSong}
        registerProgress={registerProgress}
        registerThumb={registerThumb}
        elapsed={elapsed}
        setOverrideElapsed={setOverrideElapsed}
        variant='mobile'
      />

      <div className='h-22 md:h-20 flex flex-row items-center px-3 md:px-8 gap-1'>
        {/* Playback controls: Play/Pause (desktop: also Skip, Leave) */}
        <PlaybackControls
          currentSong={currentSong}
          isPaused={isPaused}
          isStopped={isStopped}
          isPlaying={isPlaying}
          isConnectedToVoice={isConnectedToVoice}
          pauseBusy={pauseBusy}
          skipBusy={skipBusy}
          coolingDown={coolingDown}
          statusTitle={statusTitle}
          onPauseResume={handlePauseResume}
          onSkip={handleSkip}
          onStop={handleStop}
          onCooldownClick={handleCooldownClick}
        />

        {/* Desktop: spacer → art → metadata+progress → spacer → loop/shuffle+queue */}
        <div className='hidden md:flex flex-1' />
        <div className='hidden md:block shrink-0'>
          <AlbumArt currentSong={currentSong} />
        </div>
        <div className='hidden md:flex flex-col flex-8 min-w-0 px-3 h-14 justify-between'>
          <MetadataSection currentSong={currentSong} elapsed={elapsed} />
          <ProgressBar
            currentSong={currentSong}
            registerProgress={registerProgress}
            registerThumb={registerThumb}
            elapsed={elapsed}
            onSeek={handleSeek}
            setOverrideElapsed={setOverrideElapsed}
            variant='desktop'
          />
        </div>
        <div className='hidden md:flex flex-1' />
        <div className='hidden md:flex items-center gap-1.5 shrink-0'>
          <LoopShuffleControls
            currentSong={currentSong}
            loopMode={loopMode}
            isShuffled={isShuffled}
            loopBusy={loopBusy}
            shuffleBusy={shuffleBusy}
            coolingDown={coolingDown}
            statusTitle={statusTitle}
            onCycleLoop={handleCycleLoop}
            onShuffleToggle={handleShuffleToggle}
            onCooldownClick={handleCooldownClick}
          />
          <Button
            variant='inherit'
            surface='base'
            size='icon'
            onClick={() => setQueueOpen(!queueOpen)}
            title='Queue'
            className={`shrink-0 md:w-12 md:h-12 ${
              queueOpen
                ? 'pressed text-accent hover:text-accent-muted'
                : 'text-black dark:text-white hover:text-fg'
            }`}
          >
            <QueueIcon size={24} weight='duotone' className='md:w-5 md:h-5' />
          </Button>
        </div>

        {/* Mobile: metadata + art + queue */}
        <div className='md:hidden flex items-center ms-auto shrink-0'>
          {currentSong ? (
            <div className='max-w-32 min-w-0 mr-2'>
              <p className='font-body text-sm font-semibold text-fg truncate text-right'>
                {currentSong.nickname || currentSong.title}
              </p>
              {currentSong.artist && (
                <p className='font-body text-xs text-muted truncate text-right'>
                  {currentSong.artist}
                </p>
              )}
            </div>
          ) : (
            <div className='min-w-0 mr-2'>
              <p className='font-body text-sm text-muted text-right'>Nothing playing</p>
            </div>
          )}
          <AlbumArt currentSong={currentSong} />
          <div className='w-px h-8 bg-border shrink-0 mx-1' />
          <Button
            variant='inherit'
            surface='base'
            size='icon'
            onClick={() => setQueueOpen(!queueOpen)}
            title='Queue'
            className={`shrink-0 md:w-12 md:h-12 ${
              queueOpen
                ? 'pressed text-accent hover:text-accent-muted'
                : 'text-black dark:text-white hover:text-fg'
            }`}
          >
            <QueueIcon size={24} weight='duotone' className='md:w-5 md:h-5' />
          </Button>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      {queueOpen && (
        <div className='md:hidden fixed inset-0 z-50'>
          <div
            className='absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer'
            onClick={() => setQueueOpen(false)}
            role='presentation'
          />
          <div className='absolute bottom-0 left-0 right-0 max-h-[85vh] bg-surface rounded-t-2xl flex flex-col clay-floating animate-slide-up'>
            <QueuePanel
              mobileQuickControls={{
                currentSong,
                loopMode,
                isShuffled,
                loopBusy,
                shuffleBusy,
                skipBusy,
                coolingDown,
                statusTitle,
                onSkip: handleSkip,
                onCycleLoop: handleCycleLoop,
                onShuffleToggle: handleShuffleToggle,
                onCooldownClick: handleCooldownClick,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
